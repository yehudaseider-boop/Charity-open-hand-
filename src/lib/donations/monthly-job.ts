/**
 * The monthly collection job. It works through a store and a few collaborators, so it can be
 * tested without a database or gateway (the same design as the receipts job).
 *
 * Safe to run as often as you like (every hour is fine): a donation is collected at most once a
 * month, an attempt has a fixed id so a repeated or crashed run cannot charge twice, and anything
 * the gateway has not settled yet is checked again rather than charged again.
 */
import type { ConfirmOutcome } from "./confirm";
import { addMonths, attemptDonationId, chargeTime, MAX_ATTEMPTS, periodOf, retryTime, type Period } from "./schedule";

export type DueMonthly = {
  id: string;
  charitySlug: string;
  charityName: string;
  amountCents: number;
  contributionCents: number;
  /** The donor chose to cover the card charge: this month's cover, from the current rates. 0 or missing when not. */
  cardChargeCents?: number;
  chargeDay: number;
  authorizationCode: string;
  email: string;
  cardLast4: string | null;
  lastPaidPeriod: string | null;
  attemptPeriod: string | null;
  failedAttempts: number;
  /** When this collection was due (the charge day, or the retry time after a failed attempt). */
  nextChargeAt: Date;
};

export interface MonthlyStore {
  /**
   * Active monthly donations whose collection time has come. One whose stored card cannot be
   * read comes back in `unreadable` (reported, not charged) so it never stops the others.
   */
  due(now: Date, limit: number): Promise<{ rows: DueMonthly[]; unreadable: { id: string; message: string }[] }>;
  /** Take the donation for this run. False if another run has it. */
  claim(id: string, now: Date): Promise<boolean>;
  /** A collection attempt's donation: its status and when it was created, or null if it does not exist yet. */
  attemptStatus(donationId: string): Promise<{ status: string; createdAt: Date } | null>;
  /** Is the monthly donation still active (not cancelled, paused or erased since it was read)? Checked just before a charge. */
  stillActive(id: string): Promise<boolean>;
  /** Create the (pending) donation for one attempt, copying the donor's details from their first donation. */
  createAttempt(r: DueMonthly, donationId: string, totalCents: number): Promise<void>;
  /** Move the monthly donation's next collection time without charging (already collected this month). */
  reschedule(id: string, nextChargeAt: Date): Promise<void>;
  recordPaid(id: string, period: Period, nextChargeAt: Date): Promise<void>;
  /** A failed attempt. `retryAt` null means the attempts are used up: the monthly donation is marked failed. */
  recordFailure(id: string, period: Period, failedAttempts: number, retryAt: Date | null): Promise<void>;
  /** The gateway refused the charge outright: the attempt's donation is marked failed (it was never sent for confirmation). */
  failAttempt(donationId: string): Promise<void>;
  /** The donor has a new-card payment page open for this monthly donation ("Update my card"). */
  newCardPending?(id: string, now: Date): Promise<boolean>;
}

export type MonthlyDeps = {
  /** Stop starting new donations after this time (epoch milliseconds): a host kills a run that goes on too long. */
  deadline?: number;
  store: MonthlyStore;
  charge(req: { reference: string; r: DueMonthly; totalCents: number }): Promise<void>;
  /**
   * Ask the gateway about a try and record the answer. With `closeUnpaidBefore`, a try made before then that the
   * gateway says was abandoned or never received is closed as failed and comes back as "closed_unpaid".
   */
  confirm(reference: string, opts?: { closeUnpaidBefore?: Date }): Promise<CollectionOutcome>;
  /** Whether an error from `confirm` means the gateway has no record of the payment at all. */
  isNotFound(e: unknown): boolean;
  /**
   * Whether an error from `charge` means the gateway answered that the card was declined (counted as a failed
   * attempt, and the donor is told). Any other error is reported for a person and the attempt checked next run.
   */
  isDeclined(e: unknown): boolean;
  /** Write a line to the audit log for a person (Admin, Payments and the daily email). Never stops the run. */
  audit?(action: MonthlyAuditAction, recurringId: string, details: Record<string, unknown>): Promise<void>;
  /** Whether the charity can still take donations, and its account at the gateway. */
  charityState(slug: string): Promise<{ accepting: boolean }>;
  notifyFailed(r: DueMonthly, info: { totalCents: number; final: boolean; failedAttempts: number }): Promise<void>;
  now: Date;
  limit?: number;
};

/** A try's outcome: the payment check's, or closed here as unpaid (abandoned, or never received, after 48 hours). */
export type CollectionOutcome = ConfirmOutcome | "closed_unpaid";

/** Audit actions the monthly job writes; each is a held item for a person (see ops/held.ts). */
export type MonthlyAuditAction = "monthly.charge_error" | "monthly.try_unconfirmed" | "monthly.waiting_on_provider";

export type MonthlySummary = {
  considered: number;
  paid: number;
  failed: number;
  stopped: number;
  /** The run stopped early, out of time: the rest is collected by the next run. */
  cutOff?: boolean;
  /** Not settled yet, or skipped: checked again next run. */
  waiting: { id: string; reason: string }[];
  alreadyPaid: number;
  /** The gateway took a payment that does not match what was asked: held for a person to look at, not charged again. */
  review: { id: string; donationId: string }[];
  /**
   * Tries counted as failed without the provider saying the card was declined: abandoned or never received at the
   * provider after 48 hours, or marked failed here and unknown to the provider. The donor is not emailed (we can't
   * say "declined"), the card is kept, and the last such try of a month moves on to next month instead of stopping.
   */
  unconfirmed?: { id: string; donationId: string; why: "closed_unpaid" | "never_received" }[];
  /**
   * Held: a try the provider has still called pending for more than 48 hours. Nothing more is charged for that
   * monthly donation until the provider settles it (it is asked again every run); a person is told.
   */
  waitingOnProvider?: { id: string; donationId: string; totalCents: number; charityName: string }[];
  errors: { id: string; message: string }[];
};

/** An attempt the gateway still has no record of after this long is taken to have died before the charge was sent. */
const STUCK_AFTER_MS = 20 * 60_000;
/**
 * An attempt the gateway still calls pending after this long needs a person: the monthly donation is held (never a
 * new try that month: the old one could still go through, and charging twice is worse than missing a month).
 */
export const PENDING_TIMEOUT_MS = 48 * 3_600_000;

/**
 * The month a due row is collecting for. A retry belongs to the month of the failed attempt, and a
 * first attempt to the month of its charge day, even when the run happens after midnight on the 1st.
 * Never more than one month back: a donation that waited longer (a long pause, the job not running)
 * is collected for the current month, so a skipped month is never charged late.
 */
export function collectingPeriod(r: Pick<DueMonthly, "attemptPeriod" | "lastPaidPeriod" | "failedAttempts" | "nextChargeAt">, now: Date): Period {
  const current = periodOf(now);
  const retrying = r.attemptPeriod !== null && r.attemptPeriod !== r.lastPaidPeriod && r.failedAttempts > 0 && r.failedAttempts < MAX_ATTEMPTS;
  const candidate = retrying ? r.attemptPeriod! : periodOf(r.nextChargeAt);
  return candidate >= addMonths(current, -1) && candidate <= current ? candidate : current;
}

/**
 * What this month's earlier attempts came to, asked fresh: any paid, any still unsettled (the oldest of them), or all
 * turned down. An old one the provider says was abandoned or never received is closed as unpaid (it can't be charged).
 */
async function earlierAttemptsOutcome(
  id: string,
  period: string,
  attempt: number,
  deps: MonthlyDeps,
): Promise<{ kind: "paid" } | { kind: "failed" } | { kind: "unsettled"; donationId: string; createdAt: Date }> {
  let unsettled: { kind: "unsettled"; donationId: string; createdAt: Date } | null = null;
  for (let n = 0; n < attempt; n++) {
    const earlierId = attemptDonationId(id, period, n);
    const saved = await deps.store.attemptStatus(earlierId);
    if (saved === null) continue;
    if (saved.status === "paid") return { kind: "paid" };
    let outcome: CollectionOutcome;
    try {
      outcome = await deps.confirm(earlierId, { closeUnpaidBefore: new Date(deps.now.getTime() - PENDING_TIMEOUT_MS) });
    } catch (e) {
      // The provider never heard of it: nothing was charged by that attempt.
      if (deps.isNotFound(e)) continue;
      throw e;
    }
    if (outcome === "paid") return { kind: "paid" };
    if (outcome !== "failed" && outcome !== "not_found" && outcome !== "closed_unpaid" && unsettled === null) {
      unsettled = { kind: "unsettled", donationId: earlierId, createdAt: saved.createdAt };
    }
  }
  return unsettled ?? { kind: "failed" };
}

export async function runMonthlyCharges(deps: MonthlyDeps): Promise<MonthlySummary> {
  const { store, now } = deps;
  const summary: MonthlySummary = { considered: 0, paid: 0, failed: 0, stopped: 0, waiting: [], alreadyPaid: 0, review: [], unconfirmed: [], waitingOnProvider: [], errors: [] };
  const audit = (action: MonthlyAuditAction, id: string, details: Record<string, unknown>) =>
    deps.audit?.(action, id, details).catch((e) => console.error(`[monthly] could not write ${action} to the audit log`, e));

  const { rows, unreadable } = await store.due(now, deps.limit ?? 50);
  summary.errors.push(...unreadable);
  for (const r of rows) {
    // Out of time: stop before the next donation (nothing is half done, and what is left is taken next run).
    if (deps.deadline !== undefined && Date.now() > deps.deadline) {
      summary.cutOff = true;
      break;
    }
    summary.considered += 1;
    try {
      const period = collectingPeriod(r, now);
      const next = chargeTime(addMonths(period, 1), r.chargeDay);
      // Never twice in one month, and never a catch-up for months that were skipped (paused).
      if (r.lastPaidPeriod === period) {
        await store.reschedule(r.id, next);
        summary.alreadyPaid += 1;
        continue;
      }
      if (!(await store.claim(r.id, now))) {
        summary.waiting.push({ id: r.id, reason: "being handled by another run" });
        continue;
      }
      // The donor is putting in a new card ("Update my card"): never try the old one meanwhile.
      if (await store.newCardPending?.(r.id, now)) {
        summary.waiting.push({ id: r.id, reason: "the donor is putting in a new card" });
        continue;
      }
      if (!(await deps.charityState(r.charitySlug)).accepting) {
        summary.waiting.push({ id: r.id, reason: "the charity is not taking donations right now" });
        continue;
      }

      const attempt = r.attemptPeriod === period ? r.failedAttempts : 0;
      const donationId = attemptDonationId(r.id, period, attempt);
      const totalCents = r.amountCents + r.contributionCents + (r.cardChargeCents ?? 0);
      const existing = await store.attemptStatus(donationId);
      // A try the provider has called pending for more than 48 hours holds this monthly donation: nothing more is
      // charged until the provider settles it (the old try could still go through; a missed month is the lesser
      // harm). The donor is not emailed and the card is kept. It is asked about again on every run.
      const hold = async (heldId: string) => {
        summary.waitingOnProvider!.push({ id: r.id, donationId: heldId, totalCents, charityName: r.charityName });
        await audit("monthly.waiting_on_provider", r.id, { donationId: heldId, totalCents, charityName: r.charityName });
      };
      const oldEnough = (createdAt: Date) => now.getTime() - createdAt.getTime() > PENDING_TIMEOUT_MS;
      const closeUnpaidBefore = new Date(now.getTime() - PENDING_TIMEOUT_MS);
      // Before a retry, ask about this month's earlier attempts: one that was turned down may have gone
      // through after all (a late webhook, the provider finishing it). Then this month is paid, and a new
      // attempt would charge the donor twice. One still unsettled holds the retry until it is.
      if (existing === null && attempt > 0) {
        const earlier = await earlierAttemptsOutcome(r.id, period, attempt, deps);
        if (earlier.kind === "paid") {
          await store.recordPaid(r.id, period, next);
          summary.paid += 1;
          continue;
        }
        if (earlier.kind === "unsettled") {
          if (oldEnough(earlier.createdAt)) await hold(earlier.donationId);
          else summary.waiting.push({ id: r.id, reason: "an earlier attempt this month is not settled yet" });
          continue;
        }
      }
      // The gateway saying the card was declined counts as a failed attempt (not something to resend). Any other
      // error (an outage, a request it turned down for another reason) is never a declined card: no email to the
      // donor, no try counted, the card kept. The attempt stays pending, a person is told (audit and daily email),
      // and the next run asks the gateway about it (sending it again only if the gateway never received it).
      let refused = false;
      const send = async () => {
        // The donor may have cancelled, paused or been erased since this row was read.
        if (!(await store.stillActive(r.id))) return false;
        try {
          await deps.charge({ reference: donationId, r, totalCents });
        } catch (e) {
          if (!deps.isDeclined(e)) {
            await audit("monthly.charge_error", r.id, { donationId, message: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300) });
            throw e;
          }
          refused = true;
          await store.failAttempt(donationId);
        }
        return true;
      };
      // A try that ended without the provider saying "declined": counted, so the month moves on, but the donor is not
      // told their card was declined and the card is kept. The last try of a month waits for next month instead of
      // stopping the monthly donation. The attempt is marked failed here; if the provider later says it was paid,
      // the payment check still records it (failed can become paid).
      const countUnconfirmed = async (why: "closed_unpaid" | "never_received") => {
        await store.failAttempt(donationId);
        const failedAttempts = attempt + 1;
        await store.recordFailure(r.id, period, failedAttempts, retryTime(now, failedAttempts) ?? next);
        await audit("monthly.try_unconfirmed", r.id, { donationId, why, failedAttempts });
        summary.failed += 1;
        summary.unconfirmed!.push({ id: r.id, donationId, why });
      };
      if (existing === null) {
        // Not even an attempt row for a donor who stopped since this list was read.
        if (!(await store.stillActive(r.id))) {
          summary.waiting.push({ id: r.id, reason: "no longer active" });
          continue;
        }
        await store.createAttempt(r, donationId, totalCents);
        // If this throws, the outcome is unknown: the attempt stays pending and is checked next run; it is
        // sent again only if the gateway later says it never received it.
        if (!(await send())) {
          summary.waiting.push({ id: r.id, reason: "no longer active" });
          continue;
        }
      }

      // After a refusal, ask the gateway what it recorded (this also marks the attempt failed); a refusal
      // it has no transaction for is still a failed attempt.
      const settle = async (): Promise<CollectionOutcome> => {
        if (!refused) return deps.confirm(donationId, { closeUnpaidBefore });
        try {
          return await deps.confirm(donationId, { closeUnpaidBefore });
        } catch (e) {
          if (deps.isNotFound(e)) return "failed";
          throw e;
        }
      };
      let outcome: CollectionOutcome;
      try {
        outcome = await settle();
      } catch (e) {
        // Marked failed here, and the gateway has never heard of it: a declined send whose run stopped before it
        // was counted. Nothing was charged and nothing can come of it: count the try and move on (no email: the
        // decline's own words are gone), instead of the same error every day.
        if (existing !== null && existing.status === "failed" && deps.isNotFound(e)) {
          await countUnconfirmed("never_received");
          continue;
        }
        // A pending attempt the gateway says it has never heard of: the run that made it died (or the
        // charge was refused) before the charge reached the gateway. Only then is it sent again, under the
        // same reference. Any other error (gateway down, database) is reported and checked next run.
        const stuck =
          existing !== null && existing.status === "pending" && now.getTime() - existing.createdAt.getTime() > STUCK_AFTER_MS && deps.isNotFound(e);
        if (!stuck) throw e;
        if (!(await send())) {
          summary.waiting.push({ id: r.id, reason: "no longer active" });
          continue;
        }
        outcome = await settle();
      }
      if (outcome === "paid") {
        await store.recordPaid(r.id, period, next);
        summary.paid += 1;
      } else if (outcome === "failed") {
        const failedAttempts = attempt + 1;
        const retryAt = retryTime(now, failedAttempts);
        await store.recordFailure(r.id, period, failedAttempts, retryAt);
        await deps.notifyFailed(r, { totalCents, final: retryAt === null, failedAttempts }).catch((e) => console.error("[monthly] failure email not sent", e));
        summary.failed += 1;
        if (retryAt === null) summary.stopped += 1;
      } else if (outcome === "review") {
        // The gateway says it took a payment, but not the amount or currency asked for. Never charge this
        // month again and do not come back every hour: the attempt stays pending for a person to settle
        // (Admin, Payments), and the next collection is next month's.
        await store.reschedule(r.id, next);
        summary.review.push({ id: r.id, donationId });
      } else if (outcome === "closed_unpaid") {
        // Over 48 hours old and the provider says it was abandoned or never received: nothing can come of it, so the
        // try is counted and the normal retry follows (no "declined" email: the provider didn't say declined).
        await countUnconfirmed("closed_unpaid");
      } else if (outcome === "pending" && existing !== null && oldEnough(existing.createdAt)) {
        await hold(donationId);
      } else {
        summary.waiting.push({ id: r.id, reason: `payment ${outcome}` });
      }
    } catch (e) {
      summary.errors.push({ id: r.id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return summary;
}

export { MAX_ATTEMPTS };
