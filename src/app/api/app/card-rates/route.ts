import { NextResponse } from "next/server";
import { cardChargeRates } from "@/lib/donations/card-charge";

/**
 * The payment provider's rates as the server knows them (18/11/2026), so the phone app's list of monthly donations
 * shows what each month really collects when the donor covers the card charge, worked out as the website does it.
 * Null when the rates aren't filled in or Givezy pays the charge itself (then nothing is added). Not a secret: the
 * give screen already shows the same rates.
 */
export async function GET() {
  return NextResponse.json({ ok: true, cardChargeRates: cardChargeRates() }, { headers: { "cache-control": "no-store" } });
}
