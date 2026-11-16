import { NextResponse, type NextRequest } from "next/server";
import { runMonthlyGiving } from "@/lib/donations/monthly-store";
import { cronAllowed } from "@/lib/ops/alert";

/** The longest this may run (13/11/2026): each provider call is given 20 seconds, so a run needs room to finish. */
export const maxDuration = 60;

/**
 * Collects the monthly donations that are due. A scheduler calls this about once an hour
 * with `Authorization: Bearer <CRON_SECRET>`. Safe to call more often (see monthly-job.ts).
 * Without CRON_SECRET set, the job is switched off.
 */
async function handle(request: NextRequest) {
  const allowed = cronAllowed(request);
  if (allowed === null) return new NextResponse("Switched off", { status: 503 });
  if (!allowed) return new NextResponse("Not allowed", { status: 401 });

  try {
    // Only ids and counts come back: no donor details.
    // No new collection starts after 35 seconds, so the run finishes inside its time limit; the rest wait for the
    // next run (each collection keeps its own reference, and the provider is asked before anything is sent again).
    return NextResponse.json(await runMonthlyGiving(new Date(), Date.now() + 35_000), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[monthly] run failed", e);
    return new NextResponse("Run failed", { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
