import { NextResponse, type NextRequest } from "next/server";
import { runMonthlyGiving } from "@/lib/donations/monthly-store";
import { syncPayouts } from "@/lib/donations/payouts";
import { alertGivezy, cronAllowed } from "@/lib/ops/alert";
import { pingHeartbeat } from "@/lib/ops/heartbeat";
import { collectMonthlyWithin, dailyDigest, fingerprintsAlertLines, payoutsAlertLines, runDailyChecks, runImportantEmailRetries, sendsAlertLines, type RetriesDone } from "@/lib/ops/daily";
import { runJourneys } from "@/lib/charity/journey-store";
import { runCarryOnSends, type CarryOnSummary } from "@/lib/charity/carry-on-sends";
import { withGatewayTimeout } from "@/lib/gateway/timeout";
import { convertEmailFingerprints, type ConvertSummary } from "@/lib/email-fingerprint-convert";

/** Each call to the payment provider inside this job waits at most this long, so one slow call can't push the job past its minute. */
export const DAILY_GATEWAY_TIMEOUT_MS = 10_000;

/**
 * Charities' unfinished emails to donors (thank-yous and news emails), carried on after the day's email and the
 * check-in: started only in the first 40 seconds, for at most 12 seconds, and no new email after 44 (each has an
 * 8-second limit), so the deposit report and the journeys keep their time. What isn't reached carries on tomorrow.
 */
export const CARRY_ON_START_BY_MS = 40_000;
export const CARRY_ON_MAX_MS = 12_000;
export const CARRY_ON_END_BY_MS = 44_000;

/** Keying email fingerprints left at the plain hash (24/11/2026): started only in the first 36 seconds, for at most 3. */
export const FINGERPRINTS_START_BY_MS = 36_000;
export const FINGERPRINTS_MAX_MS = 3_000;

/**
 * Keying email fingerprints is off unless FINGERPRINT_CONVERT is exactly "yes" (24/11/2026). Code from before the change
 * can't read a keyed row, so once rows are converted a rollback to it would see no opt-outs at all. Switched on only
 * after the new code has run cleanly for a few days (go-live checklist); after that, fix forward, never roll back.
 * While it is off nothing is lost: every lookup matches both the keyed and the plain value.
 */
const fingerprintConvertOn = () => process.env.FINGERPRINT_CONVERT === "yes";

/**
 * Everything that runs once a day, in order: collect the monthly donations that are due, the safety net (pending
 * payments, failed confirmation emails, held items), the Givezy team's email when something needs a person and the
 * monitoring check-in, then, in the time left, charities' unfinished emails to donors carried on, the payment
 * provider's payouts for the Deposits page and the donors' journey emails. The checks, the email and the check-in come
 * first, so a slow payment provider or email service can never stop them. Called by the scheduler
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
  // its deadline); the checks stop at 45; then the day's email and the check-in. Charities' unfinished emails to donors
  // carry on for up to 12 seconds (not started after 40, no new email after 44, each email at most 8 seconds). The
  // payouts start nothing new after 48 and the journeys after 46. Every call to the payment provider waits at most 10
  // seconds (DAILY_GATEWAY_TIMEOUT_MS).
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
  const lines = dailyDigest(checks, {
    monthlyFailed: monthly === null,
    monthlyCutOff: monthly?.cutOff === true,
    monthlyErrors: monthly?.errors.length ?? 0,
    monthlyReview: monthly?.review.length ?? 0,
    monthlyStopped: monthly?.stopped ?? 0,
    monthlyWaitingOnProvider: monthly?.waitingOnProvider ?? [],
    // Read after this email (below), with its own short email when it has a problem.
    payoutsFailed: false,
  });
  // The day's alert to Givezy goes first, so nothing after it can hold it up.
  if (lines.length) await alertGivezy(`${lines.length} ${lines.length === 1 ? "thing needs" : "things need"} a person today`, lines);
  // The check-in, straight after the day's email and only when the day's main work ran: monthly collection and the
  // checks. If either failed, no check-in is made, so the monitoring service notices the silence (an email about it has
  // already gone out). Before anything slower (21/11/2026), so carrying on charities' emails, the payouts or the
  // journeys can never use up its time.
  if (monthly !== null) await pingHeartbeat().catch(() => undefined);
  // Email fingerprints still at the plain hash become keyed (24/11/2026), in a small time budget: started only in the
  // first FINGERPRINTS_START_BY_MS, for at most FINGERPRINTS_MAX_MS, so charities' emails keep their time. What isn't
  // reached is done tomorrow; once nothing is left it is a few quick reads. Counts only in the log, never a fingerprint.
  // Only while FINGERPRINT_CONVERT=yes (see fingerprintConvertOn). Its own short email when it failed or rows are left.
  const convertOn = fingerprintConvertOn();
  const fingerprints: ConvertSummary | null | undefined = !convertOn
    ? undefined
    : Date.now() < started + FINGERPRINTS_START_BY_MS
      ? await convertEmailFingerprints(Math.min(Date.now() + FINGERPRINTS_MAX_MS, started + FINGERPRINTS_START_BY_MS + FINGERPRINTS_MAX_MS)).catch((e) => {
          console.error("[daily] converting email fingerprints failed", e instanceof Error ? e.message : e);
          return null;
        })
      : undefined;
  const fingerprintsLeft = fingerprints?.left ? Object.values(fingerprints.left).reduce((a, b) => a + b, 0) : null;
  if (fingerprints && (fingerprints.converted || fingerprintsLeft || fingerprints.cutOff)) console.log("[daily] email fingerprints", { converted: fingerprints.converted, left: fingerprintsLeft, cutOff: fingerprints.cutOff });
  const fingerprintLines = convertOn ? fingerprintsAlertLines(fingerprints && { converted: fingerprints.converted, left: fingerprintsLeft, cutOff: fingerprints.cutOff }) : [];
  if (fingerprintLines.length && Date.now() < started + 58_000) {
    await alertGivezy("email fingerprints aren't all keyed yet", fingerprintLines).catch(() => undefined);
  }
  // Charities' unfinished emails to donors carry on by themselves, after the day's email and the check-in (review
  // 21/11/2026: before them, a slow email service could hold both up). The same send functions as "Send the rest":
  // nobody is emailed twice and the one-a-week rule holds. No new email starts after 44 seconds and each has an
  // 8-second limit (JOB_SEND_TIMEOUT_MS), so it is done by about 53; one cut off may have gone and is never sent again.
  const carryOnStarted = Date.now() < started + CARRY_ON_START_BY_MS;
  const sends: CarryOnSummary | null | undefined = carryOnStarted
    ? await runCarryOnSends(Math.min(Date.now() + CARRY_ON_MAX_MS, started + CARRY_ON_END_BY_MS)).catch((e) => {
        console.error("[daily] carrying on charities' emails failed", e instanceof Error ? e.message : e);
        return null;
      })
    : undefined;
  // Charities' emails left for a person (or the step failing): their own short email, straight after, as the payouts
  // have. A send left for a person is also in the audit log, so nothing is lost if there were no time for this one.
  const sendLines = sendsAlertLines({ sendsFailed: sends === null, sendsLeftForPerson: sends?.leftForPerson ?? 0 });
  if (sendLines.length && Date.now() < started + 58_000) {
    await alertGivezy("charities' emails to donors need a person", sendLines).catch(() => undefined);
  }
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
      // Counts only: rows keyed this run and still left at the plain hash (left null when cut off; null: it failed;
      // off: FINGERPRINT_CONVERT isn't "yes"; notStarted: no time today).
      fingerprints: !convertOn ? { off: true } : fingerprints === undefined ? { notStarted: true } : fingerprints && { converted: fingerprints.converted, left: fingerprintsLeft, cutOff: fingerprints.cutOff },
      attention: lines.length,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = handle;
export const POST = handle;
