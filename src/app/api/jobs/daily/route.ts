import { NextResponse, type NextRequest } from "next/server";
import { runMonthlyGiving } from "@/lib/donations/monthly-store";
import { syncPayouts } from "@/lib/donations/payouts";
import { alertGivezy, cronAllowed } from "@/lib/ops/alert";
import { collectMonthlyWithin, dailyDigest, runDailyChecks } from "@/lib/ops/daily";

/**
 * Everything that runs once a day, in order: collect the monthly donations that are due, read the payment
 * provider's payouts for the Deposits page, then the safety net (pending payments, failed confirmation
 * emails, held items). Emails the Givezy team only when something needs a person. Called by the scheduler
 * (vercel.json) with `Authorization: Bearer <CRON_SECRET>`; safe to call again. Without CRON_SECRET it is off.
 */
// Up to a minute: the most the hosting's free plan allows, and plenty for a day's collections and checks.
export const maxDuration = 60;

async function handle(request: NextRequest) {
  const allowed = cronAllowed(request);
  if (allowed === null) return new NextResponse("Switched off", { status: 503 });
  if (!allowed) return new NextResponse("Not allowed", { status: 401 });

  // The function is allowed 60 seconds: up to 35 for the monthly collection (it goes run after run while donations
  // are due, and stops starting new ones at its deadline), and the checks stop at 52.
  const started = Date.now();
  const monthly = await collectMonthlyWithin((deadline) => runMonthlyGiving(new Date(), deadline), 35_000).catch((e) => {
    console.error("[daily] monthly collection failed", e);
    return null;
  });
  const payouts = await syncPayouts().catch((e) => {
    console.error("[daily] payouts failed", e);
    return null;
  });
  let checks;
  try {
    checks = await runDailyChecks(new Date(), started + 52_000);
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
    payoutsFailed: payouts === null || payouts.failed.length > 0,
  });
  if (lines.length) await alertGivezy(`${lines.length} ${lines.length === 1 ? "thing needs" : "things need"} a person today`, lines);
  // Only counts come back: no donor details.
  const counts = (a: unknown[]) => a.length;
  return NextResponse.json(
    {
      monthly: monthly && { ...monthly, waiting: counts(monthly.waiting), review: counts(monthly.review), errors: counts(monthly.errors) },
      payouts: payouts && { ...payouts, failed: counts(payouts.failed) },
      checks,
      attention: lines.length,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = handle;
export const POST = handle;
