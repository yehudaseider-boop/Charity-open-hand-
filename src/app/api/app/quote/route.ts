import { NextResponse, type NextRequest } from "next/server";
import { appGivingOpen, appQuoteSchema } from "@/lib/donations/app-api";
import { loadDonatableCharity } from "@/lib/donations/charity";
import { quoteDonation } from "@/lib/donations/checkout";

/** What a gift comes to, for the phone app. Nothing is recorded. */
export async function POST(request: NextRequest) {
  if (!appGivingOpen()) return NextResponse.json({ ok: false, message: "Giving in the app isn't switched on yet." }, { status: 404 });
  const body = appQuoteSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, message: "Check the amount and try again." }, { status: 400 });
  const charity = await loadDonatableCharity(body.data.slug);
  if (!charity?.acceptingPayments) return NextResponse.json({ ok: false, message: "This charity can't take online donations right now." }, { status: 409 });
  const result = quoteDonation(body.data.giftCents, body.data.contributionCents, body.data.coverCardCharge === true);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
