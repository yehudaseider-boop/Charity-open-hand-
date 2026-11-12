import "server-only";
import { logAudit } from "@/lib/audit";
import { hitRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmPayment } from "@/lib/donations/confirm";
import { deliverDonorConfirmation } from "@/lib/donations/notify";
import { retryDeclinedNotice } from "@/lib/donations/monthly-declined-retry";
import { retryReceiptEmail } from "@/lib/receipts/email-retry";
import { auditRetry, recordFailedConfirmations, runEmailRetries, supabaseRetryStore, type RetryHandler, type RetrySummary } from "@/lib/email/retry";
import { emailIsOn, retryDigestLines, type RetryKind } from "@/lib/email/retry-plan";
import { heldLabel } from "./held";

/**
 * The daily safety net, run after the monthly collection. It never charges anyone and never decides a
 * payment by itself: it asks the payment provider about payments still pending, resends confirmation emails
 * that failed, and lists what needs a person.
 */

import type { MonthlySummary } from "@/lib/donations/monthly-job";
import type { PayoutSyncSummary } from "@/lib/donations/payouts";

/**
 * Collect the monthly donations that are due, run after run, until none are left or the time budget is
 * used. One run handles 50, and a charity can have far more due on the same day. Safe to repeat and to be cut
 * off: a donation is claimed before it is tried, so it is never charged twice, and what is left is picked up by
 * the next call (tomorrow's job, or the hourly one once the host allows it).
 */
export async function collectMonthlyWithin(run: (deadline: number) => Promise<MonthlySummary>, budgetMs: number, now: () => number = Date.now): Promise<MonthlySummary & { runs: number }> {
  const total: MonthlySummary & { runs: number } = { considered: 0, paid: 0, failed: 0, stopped: 0, waiting: [], alreadyPaid: 0, review: [], unconfirmed: [], errors: [], runs: 0 };
  const started = now();
  // Each run stops starting new donations at the deadline it is given, so a run can't go past the budget by much.
  while (total.runs === 0 || now() - started < budgetMs - 5_000) {
    const s = await run(started + budgetMs);
    total.runs += 1;
    if (s.cutOff) total.cutOff = true;
    total.considered += s.considered;
    total.paid += s.paid;
    total.failed += s.failed;
    total.stopped += s.stopped;
    total.alreadyPaid += s.alreadyPaid;
    total.waiting.push(...s.waiting);
    total.review.push(...s.review);
    total.unconfirmed!.push(...(s.unconfirmed ?? []));
    total.errors.push(...s.errors);
    // Stop when a run found nothing due, did nothing useful (rows that only error or wait would come back every run), or ran out of time.
    const progress = s.paid + s.failed + s.stopped + s.alreadyPaid + s.review.length;
    if (s.considered === 0 || progress === 0 || s.cutOff) break;
    if (total.runs >= 20) break;
  }
  return total;
}

export type DailyChecks = {
  /** The checks ran out of time and stopped early: the rest is done tomorrow. */
  incomplete: boolean;
  /** New cards that were paid but not yet kept, finished by this run. */
  cardUpdatesFinished: number;
  pending: { checked: number; paid: number; failed: number; still: number; errors: number };
  /** Pending for more than 3 days: the provider still has no answer. */
  stuckPending: number;
  /** Checkouts the donor left unpaid (the provider says abandoned or never received), closed as failed after 48 hours. */
  abandonedClosed?: number;
  /** The older once-a-day resend of confirmations, used only until the email_retries table is there. */
  confirmations: { resent: number; failedAgain: number };
  /** Important emails tried again (gift confirmations, s18A receipts, declined-card notices). */
  emailRetries?: Pick<RetrySummary, "resent" | "skipped" | "gone" | "failedAgain" | "gaveUp" | "expired" | "unknown"> & { broken?: boolean };
  /** Payment messages from the provider not handled after an hour. */
  unhandledEvents: number;
  /** Held items from the last day, by what they are. */
  held: Record<string, number>;
};

const HOUR = 3_600_000;
/**
 * A checkout the provider says was abandoned (or never received) is closed as failed once it is this old: well past
 * the time a donor takes to pay, and before the "pending more than 3 days" alert, which then only shows payments the
 * provider is really still working on. A closed checkout can still become paid if the provider says so later.
 */
export const ABANDONED_AFTER_HOURS = 48;

export async function runDailyChecks(now = new Date(), deadline = Infinity): Promise<DailyChecks> {
  const db = createAdminClient();
  const out: DailyChecks = { incomplete: false, cardUpdatesFinished: 0, pending: { checked: 0, paid: 0, failed: 0, still: 0, errors: 0 }, stuckPending: 0, abandonedClosed: 0, confirmations: { resent: 0, failedAgain: 0 }, unhandledEvents: 0, held: {} };
  const closeAbandonedBefore = new Date(now.getTime() - ABANDONED_AFTER_HOURS * HOUR);
  const check = async (ref: string) => {
    const o = await confirmPayment(ref, { closeAbandonedBefore });
    if (o === "paid") out.pending.paid += 1;
    else if (o === "failed") out.pending.failed += 1;
    else out.pending.still += 1;
    return o;
  };

  // 1. Once-off payments still pending (older than 30 minutes, the last week): ask the provider. Monthly
  // collections are the monthly job's own; gifts a charity recorded itself are never pending.
  const { data: pending, error: pErr } = await db
    .from("donations")
    .select("gateway_ref, created_at")
    .eq("status", "pending")
    // Every kind, the first payment of a monthly donation and a new card too: if the provider's message never
    // arrived, this is what settles them. (confirmPayment is safe to repeat.)
    .neq("gateway", "recorded")
    .lt("created_at", new Date(now.getTime() - 0.5 * HOUR).toISOString())
    .gte("created_at", new Date(now.getTime() - 7 * 24 * HOUR).toISOString())
    // Newest first: every payment is checked in its first days, and a week of abandoned checkouts (still
    // "pending" at the provider) can never crowd a real, recent payment out of the 100.
    .order("created_at", { ascending: false })
    .limit(100);
  if (pErr) throw new Error(`Could not list pending payments: ${pErr.message}`);
  for (const p of pending ?? []) {
    if (Date.now() > deadline) {
      out.incomplete = true;
      break;
    }
    out.pending.checked += 1;
    try {
      const o = await check(p.gateway_ref as string);
      if (o === "failed" && new Date(p.created_at as string) < closeAbandonedBefore) out.abandonedClosed! += 1;
    } catch {
      // The provider couldn't be reached, or never heard of a recent one (the donor closed the page before paying).
      out.pending.errors += 1;
    }
  }
  // 1a. Older checkouts (a week to 30 days, the rest of the "pending more than 3 days" window), oldest first: the
  // ones the provider says were abandoned or never received are closed, so they stop lighting that alert.
  const { data: older, error: oErr } = await db
    .from("donations")
    .select("gateway_ref")
    .eq("status", "pending")
    .neq("gateway", "recorded")
    .lt("created_at", new Date(now.getTime() - 7 * 24 * HOUR).toISOString())
    .gte("created_at", new Date(now.getTime() - 30 * 24 * HOUR).toISOString())
    .order("created_at", { ascending: true })
    .limit(50);
  if (oErr) throw new Error(`Could not list older pending payments: ${oErr.message}`);
  for (const p of older ?? []) {
    if (Date.now() > deadline) {
      out.incomplete = true;
      break;
    }
    out.pending.checked += 1;
    try {
      if ((await check(p.gateway_ref as string)) === "failed") out.abandonedClosed! += 1;
    } catch {
      out.pending.errors += 1;
    }
  }
  const { count: stuck } = await db
    .from("donations")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .neq("gateway", "recorded")
    .lt("created_at", new Date(now.getTime() - 3 * 24 * HOUR).toISOString())
    .gte("created_at", new Date(now.getTime() - 30 * 24 * HOUR).toISOString());
  out.stuckPending = stuck ?? 0;

  // 1b. A new card that was paid but not kept yet (the call that saved the payment stopped part-way): finishing it
  // is what lets the monthly job go back to collecting, and sends the donor the confirmation they did not get.
  const { data: unsaved } = await db
    .from("monthly_card_updates")
    .select("donations!inner(gateway_ref, status)")
    .is("finished_at", null)
    .eq("donations.status", "paid")
    .limit(50);
  for (const u of unsaved ?? []) {
    if (Date.now() > deadline) {
      out.incomplete = true;
      break;
    }
    const gift = u.donations as unknown as { gateway_ref: string } | { gateway_ref: string }[];
    const ref = (Array.isArray(gift) ? gift[0] : gift)?.gateway_ref;
    if (!ref) continue;
    try {
      await confirmPayment(ref);
      out.cardUpdatesFinished += 1;
    } catch {
      out.pending.errors += 1;
    }
  }

  // 2. Important emails that failed: tried again an hour later (the next run), then a day, then three days, then
  // Givezy is told once. Nothing at all while email is off: a "sent" must mean a real email left.
  if (emailIsOn()) {
    const since = new Date(now.getTime() - 7 * 24 * HOUR).toISOString();
    // Its own catch: a problem with the list to try again never stops the checks below or the daily email.
    try {
      const retries = await runEmailRetries({ store: supabaseRetryStore(db), handlers: retryHandlers, now, deadline, audit: auditRetry });
      if (retries.notSetUp) await resendConfirmationsOldWay(db, since, deadline, out);
      else {
        if (retries.incomplete) out.incomplete = true;
        out.emailRetries = {
          resent: retries.resent,
          skipped: retries.skipped,
          gone: retries.gone,
          failedAgain: retries.failedAgain,
          gaveUp: retries.gaveUp,
          expired: retries.expired,
          unknown: retries.unknown,
        };
        // Confirmations that failed before the table existed (only in the audit log): put them on the list once,
        // in one write. Skipped on a run that is out of time: tomorrow's run does it.
        if (!retries.incomplete && Date.now() < deadline) await queueAuditOnlyFailures(db, since);
      }
    } catch (e) {
      console.error("[daily] trying failed emails again did not run", e);
      out.emailRetries = { resent: 0, skipped: 0, gone: 0, failedAgain: 0, gaveUp: 0, expired: 0, unknown: 0, broken: true };
    }
  }

  // 3. Provider messages not handled after an hour.
  const { count: events } = await db
    .from("gateway_events")
    .select("id", { count: "exact", head: true })
    .is("processed_at", null)
    .lt("received_at", new Date(now.getTime() - HOUR).toISOString());
  out.unhandledEvents = events ?? 0;

  // 4. Held items from the last day (the same list as Admin, Payments).
  const { data: held } = await db
    .from("audit_log")
    .select("action")
    .in("action", Object.keys(heldLabel))
    .gte("created_at", new Date(now.getTime() - 24 * HOUR).toISOString())
    .limit(500);
  for (const h of held ?? []) out.held[h.action as string] = (out.held[h.action as string] ?? 0) + 1;
  return out;
}

/** Each kind's sender for a try again. */
const retryHandlers: Record<RetryKind, RetryHandler> = {
  donation_confirmation: (row, signal) => deliverDonorConfirmation(row.refId, { signal }),
  s18a_receipt: (row, signal) => retryReceiptEmail(row.refId, signal),
  monthly_declined: (row, signal) => retryDeclinedNotice(row.refId, row.payload, signal),
};

/** Confirmations noted as failed in the audit log in the last week and not resent: added to the list to try again. */
async function queueAuditOnlyFailures(db: ReturnType<typeof createAdminClient>, since: string) {
  const { data: failedMail } = await db.from("audit_log").select("entity_id").eq("action", "donation.confirmation_email_failed").gte("created_at", since).limit(200);
  const { data: resentMail } = await db.from("audit_log").select("entity_id").eq("action", "donation.confirmation_email_resent").gte("created_at", since).limit(1000);
  const done = new Set((resentMail ?? []).map((r) => r.entity_id as string));
  const ids = [...new Set((failedMail ?? []).map((r) => r.entity_id as string))].filter((id) => id && !done.has(id));
  // One write, and an existing row is kept as it is, so this never resets a row's tries.
  await recordFailedConfirmations(ids);
}

/**
 * Before the email_retries table exists: confirmations that failed in the last week and haven't gone since are
 * tried once a day, as before. Only a real send counts as resent.
 */
async function resendConfirmationsOldWay(db: ReturnType<typeof createAdminClient>, since: string, deadline: number, out: DailyChecks) {
  const { data: failedMail } = await db.from("audit_log").select("entity_id").eq("action", "donation.confirmation_email_failed").gte("created_at", since).limit(200);
  const { data: resentMail } = await db.from("audit_log").select("entity_id").eq("action", "donation.confirmation_email_resent").gte("created_at", since).limit(1000);
  const done = new Set((resentMail ?? []).map((r) => r.entity_id as string));
  const waiting = [...new Set((failedMail ?? []).map((r) => r.entity_id as string))].filter((id) => id && !done.has(id));
  for (const id of waiting) {
    if (Date.now() > deadline) {
      out.incomplete = true;
      break;
    }
    // Claimed first: the scheduler can call this job twice at once, and the donor must get one email, not two.
    // If two runs claim together, neither sends; tomorrow's run tries again.
    if (await hitRateLimit("confirmation-resend", [`donation:${id}`], 1, 20 * 60)) continue;
    try {
      // Refunded or charged back since: no "thank you for your donation" ("gone").
      const result = await deliverDonorConfirmation(id, { signal: AbortSignal.timeout(8_000) });
      if (result === "sent") {
        out.confirmations.resent += 1;
        await logAudit({ actorUserId: null, action: "donation.confirmation_email_resent", entityType: "donation", entityId: id });
      }
    } catch {
      out.confirmations.failedAgain += 1;
    }
  }
}

/** What the monthly and payouts runs reported that needs a person. */
export type JobProblems = {
  monthlyCutOff?: boolean;
  monthlyErrors: number;
  monthlyReview: number;
  monthlyStopped: number;
  payoutsFailed: boolean;
  monthlyFailed: boolean;
};

/**
 * The deposit report's own short email, sent after the day's main email (the payouts run last, in a time budget).
 * None when it ran in full. `started` false: there was no time left to start it at all.
 */
export function payoutsAlertLines(p: PayoutSyncSummary | null, opts: { started: boolean } = { started: true }): string[] {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  if (!opts.started) return ["The deposit report had no time left to run today. Nothing is lost: it carries on tomorrow."];
  if (p === null) return ["The deposit report could not be updated today (see the job log). It tries again tomorrow."];
  const lines: string[] = [];
  if (p.outOfTime) {
    lines.push(
      `The deposit report ran out of time today${p.notReached ? ` with ${n(p.notReached, "charity", "charities")} not reached` : ""}. What was read in full is kept; the rest is read tomorrow.`,
    );
  }
  if (p.failed.length) lines.push(`The deposit report could not be read for ${n(p.failed.length, "charity", "charities")} today (see the job log). It tries again tomorrow.`);
  return lines;
}

/** The lines of the daily email, or none when nothing needs a person. Plain words, one thing per line. */
export function dailyDigest(c: DailyChecks, jobs: JobProblems): string[] {
  const lines: string[] = [];
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  if (jobs.monthlyFailed) lines.push("The monthly collection did not run today. Nothing was charged by it. It runs again tomorrow.");
  if (jobs.monthlyCutOff) lines.push("The monthly collection ran out of time and stopped early. Nothing was charged twice. The rest is collected on tomorrow's run.");
  if (c.incomplete) lines.push("The daily checks ran out of time and stopped early. The rest is checked tomorrow.");
  if (jobs.monthlyErrors) lines.push(`Monthly collection: ${n(jobs.monthlyErrors, "monthly donation", "monthly donations")} could not be handled (see the job log).`);
  if (jobs.monthlyReview) lines.push(`Monthly collection: ${n(jobs.monthlyReview, "payment", "payments")} came back with a different amount and wait for a person.`);
  if (jobs.monthlyStopped) lines.push(`${n(jobs.monthlyStopped, "monthly donation", "monthly donations")} stopped after three declined tries. The donors were emailed a link to put in a new card.`);
  if (jobs.payoutsFailed) lines.push("The deposit report could not be updated today. It tries again tomorrow.");
  if (c.stuckPending) lines.push(`${n(c.stuckPending, "payment has", "payments have")} been pending for more than 3 days.`);
  if (c.unhandledEvents) lines.push(`${n(c.unhandledEvents, "message from the payment provider was", "messages from the payment provider were")} not handled within an hour.`);
  if (c.emailRetries) lines.push(...retryDigestLines(c.emailRetries));
  if (c.confirmations.failedAgain) lines.push(`${n(c.confirmations.failedAgain, "confirmation email", "confirmation emails")} to donors still could not be sent.`);
  for (const [action, count] of Object.entries(c.held)) lines.push(`${heldLabel[action] ?? action}: ${count}`);
  return lines;
}
