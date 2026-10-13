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
  chargeDay: number;
  authorizationCode: string;
  email: string;
  cardLast4: string | null;
  lastPaidPeriod: string | null;
  attemptPeriod: string | null;
  failedAttempts: number;
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
}

export type MonthlyDeps = {
  store: MonthlyStore;
  charge(req: { reference: string; r: DueMonthly; totalCents: number }): Promise<void>;
  confirm(reference: string): Promise<ConfirmOutcome>;
  /** Whether the charity can still take donations, and its account at the gateway. */
  charityState(slug: string): Promise<{ accepting: boolean }>;
  notifyFailed(r: DueMonthly, info: { totalCents: number; final: boolean }): Promise<void>;
  now: Date;
  limit?: number;
};

export type MonthlySummary = {
  considered: number;
  paid: number;
  failed: number;
  stopped: number;
  /** Not settled yet, or skipped: checked again next run. */
  waiting: { id: string; reason: string }[];
  alreadyPaid: number;
  errors: { id: string; message: string }[];
};

/** An attempt the gateway still has no record of after this long is taken to have died before the charge was sent. */
const STUCK_AFTER_MS = 20 * 60_000;

export async function runMonthlyCharges(deps: MonthlyDeps): Promise<MonthlySummary> {
  const { store, now } = deps;
  const period = periodOf(now);
  const summary: MonthlySummary = { considered: 0, paid: 0, failed: 0, stopped: 0, waiting: [], alreadyPaid: 0, errors: [] };

  const { rows, unreadable } = await store.due(now, deps.limit ?? 50);
  summary.errors.push(...unreadable);
  for (const r of rows) {
    summary.considered += 1;
    try {
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
      if (!(await deps.charityState(r.charitySlug)).accepting) {
        summary.waiting.push({ id: r.id, reason: "the charity is not taking donations right now" });
        continue;
      }

      const attempt = r.attemptPeriod === period ? r.failedAttempts : 0;
      const donationId = attemptDonationId(r.id, period, attempt);
      const totalCents = r.amountCents + r.contributionCents;
      const existing = await store.attemptStatus(donationId);
      const send = async () => {
        // The donor may have cancelled, paused or been erased since this row was read.
        if (!(await store.stillActive(r.id))) return false;
        await deps.charge({ reference: donationId, r, totalCents });
        return true;
      };
      if (existing === null) {
        await store.createAttempt(r, donationId, totalCents);
        // If this throws, the outcome is unknown: the attempt stays pending and is only checked, never charged again.
        if (!(await send())) {
          summary.waiting.push({ id: r.id, reason: "no longer active" });
          continue;
        }
      }

      let outcome: ConfirmOutcome;
      try {
        outcome = await deps.confirm(donationId);
      } catch (e) {
        // A pending attempt the gateway has never heard of: the run that made it died (or the charge was
        // refused) before the charge reached the gateway. Send it again under the same reference; the
        // gateway refuses a reference it already has, so this cannot take the money twice.
        const stuck = existing !== null && existing.status === "pending" && now.getTime() - existing.createdAt.getTime() > STUCK_AFTER_MS;
        if (!stuck) throw e;
        if (!(await send())) {
          summary.waiting.push({ id: r.id, reason: "no longer active" });
          continue;
        }
        outcome = await deps.confirm(donationId);
      }
      if (outcome === "paid") {
        await store.recordPaid(r.id, period, next);
        summary.paid += 1;
      } else if (outcome === "failed") {
        const failedAttempts = attempt + 1;
        const retryAt = retryTime(now, failedAttempts);
        await store.recordFailure(r.id, period, failedAttempts, retryAt);
        await deps.notifyFailed(r, { totalCents, final: retryAt === null }).catch((e) => console.error("[monthly] failure email not sent", e));
        summary.failed += 1;
        if (retryAt === null) summary.stopped += 1;
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
