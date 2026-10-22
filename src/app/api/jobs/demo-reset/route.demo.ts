import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { demoModeOn } from "@/lib/demo/mode";
import { DemoResetRefused, resetDemo } from "@/lib/demo/reset";

/**
 * The demo's nightly reset: puts every made-up charity, donor and gift back as new. The host's
 * scheduler calls it once a day (vercel.json) with `Authorization: Bearer <CRON_SECRET>`.
 * Only built when DEMO_MODE=yes, and refuses at run time unless demo mode is on; resetDemo then
 * checks the database is the demo's own before deleting anything.
 */
export const maxDuration = 300;

async function handle(request: NextRequest) {
  if (!demoModeOn()) return new NextResponse("Not found", { status: 404 });
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("Switched off", { status: 503 });
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new NextResponse("Not allowed", { status: 401 });
  try {
    return NextResponse.json(await resetDemo(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[demo-reset] failed", e instanceof Error ? e.message : e);
    return new NextResponse(e instanceof DemoResetRefused ? e.message : "Reset failed", { status: e instanceof DemoResetRefused ? 409 : 500 });
  }
}

export const GET = handle;
export const POST = handle;
