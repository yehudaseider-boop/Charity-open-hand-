import { NextResponse, type NextRequest } from "next/server";
import { syncPayouts } from "@/lib/donations/payouts";
import { cronAllowed } from "@/lib/ops/alert";

/** The longest this may run (13/11/2026): each provider call is given 20 seconds, so a run needs room to finish. */
export const maxDuration = 60;

/**
 * Reads the payment provider's payouts to each charity, for the Deposits page. A scheduler calls this once a
 * day with `Authorization: Bearer <CRON_SECRET>`. Safe to call more often. Without CRON_SECRET it is off.
 */
async function handle(request: NextRequest) {
  const allowed = cronAllowed(request);
  if (allowed === null) return new NextResponse("Switched off", { status: 503 });
  if (!allowed) return new NextResponse("Not allowed", { status: 401 });
  try {
    // Only counts and charity ids come back: no donor details.
    return NextResponse.json(await syncPayouts(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[payouts] run failed", e);
    return new NextResponse("Run failed", { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
