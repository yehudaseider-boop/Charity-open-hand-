import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runMonthlyGiving } from "@/lib/donations/monthly-store";

/**
 * Collects the monthly donations that are due. A scheduler calls this about once an hour
 * with `Authorization: Bearer <CRON_SECRET>`. Safe to call more often (see monthly-job.ts).
 * Without CRON_SECRET set, the job is switched off.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("Switched off", { status: 503 });
  const got = request.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new NextResponse("Not allowed", { status: 401 });

  try {
    // Only ids and counts come back: no donor details.
    return NextResponse.json(await runMonthlyGiving(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[monthly] run failed", e);
    return new NextResponse("Run failed", { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
