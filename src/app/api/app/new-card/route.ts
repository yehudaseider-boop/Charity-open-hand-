import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appAccount } from "@/lib/app-auth";
import { newCardPath, ownsMonthly } from "@/lib/donations/new-card";

const body = z.object({ id: z.uuid() });

/**
 * The signed-in app donor's own "Update my card" page for one of their monthly donations (a signed link
 * on the website). The card goes in on the payment provider's page there; the app never sees it.
 */
export async function POST(request: NextRequest) {
  const account = await appAccount(request);
  if (!account) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Something went wrong. Please try again." }, { status: 400 });
  const owns = await ownsMonthly(account.userId, parsed.data.id).catch(() => null);
  if (owns === null) return NextResponse.json({ ok: false, message: "We couldn't check just now. Please try again." }, { status: 503 });
  if (!owns) return NextResponse.json({ ok: false, message: "We couldn't find this monthly donation." }, { status: 404 });
  return NextResponse.json({ ok: true, path: newCardPath(parsed.data.id, new Date()) }, { headers: { "Cache-Control": "no-store" } });
}
