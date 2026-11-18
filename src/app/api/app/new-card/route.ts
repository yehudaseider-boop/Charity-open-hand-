import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appAccount } from "@/lib/app-auth";
import { clientIp } from "@/lib/client-ip";
import { hitRateLimit, ipKeys } from "@/lib/rate-limit";
import { newCardPath, ownsMonthly } from "@/lib/donations/new-card";

/**
 * The longest this may run (13/11/2026). The payment provider is given 20 seconds; this leaves room for our own
 * steps, so a slow provider ends in our plain "nothing was charged" message rather than the host cutting it off.
 */
export const maxDuration = 30;

const body = z.object({ id: z.uuid() });

/**
 * The signed-in app donor's own "Update my card" page for one of their monthly donations (a signed link
 * on the website). The card goes in on the payment provider's page there; the app never sees it.
 */
export async function POST(request: NextRequest) {
  // Limited per internet address before the sign-in check (security review 18/11/2026; generous, because many phones share one address on mobile networks).
  if (await hitRateLimit("app-new-card", ipKeys(clientIp(request.headers)), 120, 10).catch(() => false)) {
    return NextResponse.json({ ok: false, message: "Please wait a moment, then try again." }, { status: 429 });
  }
  const account = await appAccount(request, { forMoney: true });
  if (!account) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Something went wrong. Please try again." }, { status: 400 });
  const owns = await ownsMonthly(account.userId, parsed.data.id).catch(() => null);
  if (owns === null) return NextResponse.json({ ok: false, message: "We couldn't check just now. Please try again." }, { status: 503 });
  if (!owns) return NextResponse.json({ ok: false, message: "We couldn't find this monthly donation." }, { status: 404 });
  return NextResponse.json({ ok: true, path: `${newCardPath(parsed.data.id, new Date())}&from=app` }, { headers: { "Cache-Control": "no-store" } });
}
