import { NextResponse, type NextRequest } from "next/server";
import { runMonthlyGiving } from "@/lib/donations/monthly-store";
import { syncPayouts } from "@/lib/donations/payouts";
import { alertGivezy, cronAllowed } from "@/lib/ops/alert";
import { collectMonthlyWithin, dailyDigest, payoutsAlertLines, runDailyChecks } from "@/lib/ops/daily";
import { runJourneys } from "@/lib/charity/journey-store";

/**
 * Everything that runs once a day, in order: collect the monthly donations that are due, the safety net (pending
 * payments, failed confirmation emails, held items) and the Givezy team's email when something needs a person, then,
 * in the time left, the payment provider's payouts for the Deposits page and the donors' journey emails. The checks
 * and the email come before the payouts, so a slow payment provider can never stop them. Called by the scheduler
 * (vercel.json) with `Authorization: Bearer <CRON_SECRET>`; safe to call again. Without CRON_SECRET it is off.
 */
// Up to a minute: the most the hosting's free plan allows, and plenty for a day's collections and checks.
export const maxDuration = 60;

async function handle(request: NextRequest) {
  const allowed = cronAllowed(request);
  if (allowed === null) return new NextResponse("Switched off", { status: 503 });
  if (!allowed) return new NextResponse("Not allowed", { status: 401 });

  // The function is allowed 60 seconds: up to 35 for the monthly collection (it goes run after run while donations
  // are due, and stops starting new ones at its deadline), the checks stop at 42, then the day's email. The payouts
  // start nothing new after 46 and the journeys after 45 (each step only starts if there is time).
  const started = Date.now();
  const monthly = await collectMonthlyWithin((deadline) => runMonthlyGiving(new Date(), deadline), 35_000).catch((e) => {
    console.error("[daily] monthly collection failed", e);
    return null;
  });
  let checks;
  try {
    checks = await runDailyChecks(new Date(), started + 42_000);
  } catch (e) {
    console.error("[daily] checks failed", e);
    await alertGivezy("the daily check could not run", ["The daily safety check stopped with an error (see the job log). Nothing was charged by it. It runs again tomorrow."]);
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
  // The deposit report, in a time budget: it stops cleanly (only payouts read in full are kept) and carries on tomorrow.
  const payoutsStarted = Date.now() < started + 46_000;
  const payouts = payoutsStarted
    ? await syncPayouts(new Date(), { deadline: started + 46_000 }).catch((e) => {
        console.error("[daily] payouts failed", e);
        return null;
      })
    : null;
  const payoutLines = payoutsAlertLines(payouts, { started: payoutsStarted });
  // Last, in what time is left: charities' donor journeys (CRM step 6a). No new email starts after 45 seconds, and each
  // has an 8-second limit, so the job ends inside its minute. Capped per run; the rest go tomorrow. Nothing is marked
  // sent unless it went. Before the journey's migration has run there is nothing to do and nothing is said.
  const journeys = Date.now() < started + 45_000
    ? await runJourneys(new Date(), started + 45_000).catch((e) => {
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
      journeys,
      attention: lines.length,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = handle;
export const POST = handle;
