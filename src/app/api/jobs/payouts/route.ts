import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { syncPayouts } from "@/lib/donations/payouts";

/**
 * Reads the payment provider's payouts to each charity, for the Deposits page. A scheduler calls this once a
 * day with `Authorization: Bearer <CRON_SECRET>`. Safe to call more often. Without CRON_SECRET it is off.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("Switched off", { status: 503 });
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return new NextResponse("Not allowed", { status: 401 });
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
