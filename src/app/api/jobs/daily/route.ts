import { NextResponse, type NextRequest } from "next/server";
import { runMonthlyGiving } from "@/lib/donations/monthly-store";
import { syncPayouts } from "@/lib/donations/payouts";
import { alertGivezy, cronAllowed } from "@/lib/ops/alert";
import { pingHeartbeat } from "@/lib/ops/heartbeat";
import { collectMonthlyWithin, dailyDigest, payoutsAlertLines, runDailyChecks, runImportantEmailRetries, type RetriesDone } from "@/lib/ops/daily";
import { runJourneys } from "@/lib/charity/journey-store";
import { runCarryOnSends, type CarryOnSummary } from "@/lib/charity/carry-on-sends";
import { withGatewayTimeout } from "@/lib/gateway/timeout";

/** Each call to the payment provider inside this job waits at most this long, so one slow call can't push the job past its minute. */
export const DAILY_GATEWAY_TIMEOUT_MS = 10_000;

/**
 * Charities' unfinished emails to donors (thank-yous and news emails), carried on after the checks: started only in
 * the first 40 seconds, for at most 12 seconds, and never past 44, so the day's email, the deposit report and the
 * journeys keep their time. What isn't reached carries on tomorrow.
 */
export const CARRY_ON_START_BY_MS = 40_000;
export const CARRY_ON_MAX_MS = 12_000;
export const CARRY_ON_END_BY_MS = 44_000;

/**
 * Everything that runs once a day, in order: collect the monthly donations that are due, the safety net (pending
 * payments, failed confirmation emails, held items), charities' unfinished emails to donors carried on, and the Givezy team's email when something needs a person, then,
 * in the time left, the payment provider's payouts for the Deposits page and the donors' journey emails. The checks
 * and the email come before the payouts, so a slow payment provider can never stop them. Called by the scheduler
 * (vercel.json) with `Authorization: Bearer <CRON_SECRET>`; safe to call again. Without CRON_SECRET it is off.
 */
// Up to a minute: the most the hosting's free plan allows, and plenty for a day's collections and checks.
export const maxDuration = 60;

async function handle(request: NextRequest) {
  return withGatewayTimeout(DAILY_GATEWAY_TIMEOUT_MS, () => run(request));
}

async function run(request: NextRequest) {
  const allowed = cronAllowed(request);
  if (allowed === null) return new NextResponse("Switched off", { status: 503 });
  if (!allowed) return new NextResponse("Not allowed", { status: 401 });

  // The function is allowed 60 seconds. First the important emails that failed (owed confirmations, receipts,
  // declined-card notices), started only in the first 10 seconds so a collection day never starves them. Then up to
  // 30 seconds of monthly collection (it goes run after run while donations are due, and stops starting new ones at
  // its deadline); the checks stop at 45; charities' unfinished emails to donors carry on for up to 12 seconds (not
  // started after 40, ended by 44), then the day's email. The payouts start nothing new after 48 and the journeys after
  // 46. Every call to the payment provider waits at most 10 seconds (DAILY_GATEWAY_TIMEOUT_MS).
  const started = Date.now();
  // Each email try needs its send plus reads and writes (a 12-second margin), so a deadline at 22 lets them start until 10.
  const retries: RetriesDone | undefined = await runImportantEmailRetries(new Date(), started + 22_000).catch((e) => {
    console.error("[daily] email retries failed", e);
    return undefined;
  });
  const monthly = await collectMonthlyWithin((deadline) => runMonthlyGiving(new Date(), deadline), 30_000).catch((e) => {
    console.error("[daily] monthly collection failed", e);
    return null;
  });
  let checks;
  try {
    checks = await runDailyChecks(new Date(), started + 45_000, retries ? { retries } : {});
  } catch (e) {
    console.error("[daily] checks failed", e);
    await alertGivezy("the daily check could not run", ["The daily safety check stopped with an error (see the job log). The check itself never charges anyone. It runs again tomorrow."]);
    return new NextResponse("Run failed", { status: 500 });
  }
  // Charities' unfinished emails to donors carry on by themselves, before the day's email so it can count any left for
  // a person. The same send functions as "Send the rest": nobody is emailed twice and the one-a-week rule holds.
  const carryOnStarted = Date.now() < started + CARRY_ON_START_BY_MS;
  const sends: CarryOnSummary | null | undefined = carryOnStarted
    ? await runCarryOnSends(Math.min(Date.now() + CARRY_ON_MAX_MS, started + CARRY_ON_END_BY_MS)).catch((e) => {
        console.error("[daily] carrying on charities' emails failed", e instanceof Error ? e.message : e);
        return null;
      })
    : undefined;
  const lines = dailyDigest(checks, {
    monthlyFailed: monthly === null,
    monthlyCutOff: monthly?.cutOff === true,
    monthlyErrors: monthly?.errors.length ?? 0,
    monthlyReview: monthly?.review.length ?? 0,
    monthlyStopped: monthly?.stopped ?? 0,
    monthlyWaitingOnProvider: monthly?.waitingOnProvider ?? [],
    // Read after this email (below), with its own short email when it has a problem.
    payoutsFailed: false,
    sendsFailed: sends === null,
    sendsLeftForPerson: sends?.leftForPerson ?? 0,
  });
  // The day's alert to Givezy goes first, so nothing after it can hold it up.
  if (lines.length) await alertGivezy(`${lines.length} ${lines.length === 1 ? "thing needs" : "things need"} a person today`, lines);
  // The deposit report, in a time budget: it stops cleanly (only payouts read in full are kept) and carries on tomorrow.
  const payoutsStarted = Date.now() < started + 48_000;
  const payouts = payoutsStarted
    ? await syncPayouts(new Date(), { deadline: started + 48_000 }).catch((e) => {
        console.error("[daily] payouts failed", e);
        return null;
      })
    : null;
  const payoutLines = payoutsAlertLines(payouts, { started: payoutsStarted });
  // Last, in what time is left: charities' donor journeys (CRM step 6a). No new email starts after 46 seconds, and each
  // has an 8-second limit, so the job ends inside its minute. Capped per run; the rest go tomorrow. Nothing is marked
  // sent unless it went. Before the journey's migration has run there is nothing to do and nothing is said.
  const journeys = Date.now() < started + 46_000
    ? await runJourneys(new Date(), started + 46_000).catch((e) => {
        console.error("[daily] journeys failed", e instanceof Error ? e.message : e);
        return null;
      })
    : null;
  if (journeys === null && Date.now() < started + 58_000) {
    await alertGivezy("donor journey emails didn't run today", ["The donor journey part of the daily job stopped or had no time left (see the job log). Nothing was sent twice; it tries again tomorrow."]).catch(() => undefined);
  }
  if (payoutLines.length && Date.now() < started + 58_000) {
    await alertGivezy("the deposit report wasn't fully updated today", payoutLines).catch(() => undefined);
  }
  // The check-in, last and only when the day's main work ran: monthly collection and the checks. If either failed, no
  // check-in is made, so the monitoring service notices the silence (an email about it has already gone out).
  if (monthly !== null) await pingHeartbeat().catch(() => undefined);
  // Only counts come back: no donor details.
  const counts = (a: unknown[]) => a.length;
  return NextResponse.json(
    {
      monthly: monthly && { ...monthly, waiting: counts(monthly.waiting), review: counts(monthly.review), unconfirmed: counts(monthly.unconfirmed ?? []), waitingOnProvider: counts(monthly.waitingOnProvider ?? []), errors: counts(monthly.errors) },
      payouts: payouts && { ...payouts, failed: counts(payouts.failed) },
      checks,
      // Counts only. Undefined: no time left to start it today (it carries on tomorrow).
      sends: sends === undefined ? { notStarted: true } : sends,
      journeys,
      attention: lines.length,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = handle;
export const POST = handle;
