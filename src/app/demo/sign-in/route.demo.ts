import { NextResponse, type NextRequest } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { demoModeOn } from "@/lib/demo/mode";
import { signInAsDemoPerson } from "@/lib/demo/sign-in";
import { requestOrigin } from "@/lib/request-origin";

/**
 * The demo's one-click sign-in (the buttons on /demo). This file is only built when DEMO_MODE=yes
 * (pageExtensions in next.config.ts), and it refuses at run time too unless demo mode is on.
 */
export async function POST(request: NextRequest) {
  if (!demoModeOn()) return new NextResponse("Not found", { status: 404 });
  const origin = requestOrigin(request);
  // Only our own /demo page may post here (a form on another site could otherwise sign a visitor in).
  if (request.headers.get("origin") !== new URL(origin).origin) return new NextResponse("Not allowed", { status: 403 });
  const form = await request.formData().catch(() => null);
  const result = await signInAsDemoPerson(form?.get("who"), clientIp(request.headers));
  if (result.ok) return NextResponse.redirect(`${origin}${result.next}`, 303);
  if (result.why === "off") return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(`${origin}/demo?error=${result.why}`, 303);
}

export function GET() {
  return new NextResponse("Not found", { status: 404 });
}
