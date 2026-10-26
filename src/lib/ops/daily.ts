import "server-only";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmPayment } from "@/lib/donations/confirm";
import { sendDonorConfirmation } from "@/lib/donations/notify";
import { heldLabel } from "./held";

/**
 * The daily safety net, run after the monthly collection. It never charges anyone and never decides a
 * payment by itself: it asks the payment provider about payments still pending, resends confirmation emails
 * that failed, and lists what needs a person.
 */

import type { MonthlySummary } from "@/lib/donations/monthly-job";

/**
 * Collect the monthly donations that are due, run after run, until none are left or the time budget is
 * used. One run handles 50, and a charity can have far more due on the same day. Safe to repeat and to be cut
 * off: a donation is claimed before it is tried, so it is never charged twice, and what is left is picked up by
 * the next call (tomorrow's job, or the hourly one once the host allows it).
 */
export async function collectMonthlyWithin(run: (deadline: number) => Promise<MonthlySummary>, budgetMs: number, now: () => number = Date.now): Promise<MonthlySummary & { runs: number }> {
  const total: MonthlySummary & { runs: number } = { considered: 0, paid: 0, failed: 0, stopped: 0, waiting: [], alreadyPaid: 0, review: [], errors: [], runs: 0 };
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
  confirmations: { resent: number; failedAgain: number };
  /** Payment messages from the provider not handled after an hour. */
  unhandledEvents: number;
  /** Held items from the last day, by what they are. */
  held: Record<string, number>;
};

const HOUR = 3_600_000;

export async function runDailyChecks(now = new Date(), deadline = Infinity): Promise<DailyChecks> {
  const db = createAdminClient();
  const out: DailyChecks = { incomplete: false, cardUpdatesFinished: 0, pending: { checked: 0, paid: 0, failed: 0, still: 0, errors: 0 }, stuckPending: 0, confirmations: { resent: 0, failedAgain: 0 }, unhandledEvents: 0, held: {} };

  // 1. Once-off payments still pending (older than 30 minutes, the last week): ask the provider. Monthly
  // collections are the monthly job's own; gifts a charity recorded itself are never pending.
  const { data: pending, error: pErr } = await db
    .from("donations")
    .select("gateway_ref")
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
      const o = await confirmPayment(p.gateway_ref as string);
      if (o === "paid") out.pending.paid += 1;
      else if (o === "failed") out.pending.failed += 1;
      else out.pending.still += 1;
    } catch {
      // The provider never heard of it (the donor closed the page before paying) or couldn't be reached.
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

  // 2. Confirmation emails that failed in the last week and haven't gone since: try once more.
  const since = new Date(now.getTime() - 7 * 24 * HOUR).toISOString();
  const { data: failedMail } = await db.from("audit_log").select("entity_id").eq("action", "donation.confirmation_email_failed").gte("created_at", since).limit(200);
  const { data: resentMail } = await db.from("audit_log").select("entity_id").eq("action", "donation.confirmation_email_resent").gte("created_at", since).limit(1000);
  const done = new Set((resentMail ?? []).map((r) => r.entity_id as string));
  for (const id of new Set((failedMail ?? []).map((r) => r.entity_id as string))) {
    if (!id || done.has(id)) continue;
    if (Date.now() > deadline) {
      out.incomplete = true;
      break;
    }
    if (await sendDonorConfirmation(id)) {
      out.confirmations.resent += 1;
      await logAudit({ actorUserId: null, action: "donation.confirmation_email_resent", entityType: "donation", entityId: id });
    } else out.confirmations.failedAgain += 1;
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

/** What the monthly and payouts runs reported that needs a person. */
export type JobProblems = { monthlyCutOff?: boolean; monthlyErrors: number; monthlyReview: number; monthlyStopped: number; payoutsFailed: boolean; monthlyFailed: boolean };

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
  if (c.confirmations.failedAgain) lines.push(`${n(c.confirmations.failedAgain, "confirmation email", "confirmation emails")} to donors still could not be sent.`);
  for (const [action, count] of Object.entries(c.held)) lines.push(`${heldLabel[action] ?? action}: ${count}`);
  return lines;
}
