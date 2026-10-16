import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { appAccount } from "@/lib/app-auth";
import { savedCardsOpen } from "@/lib/donations/app-api";
import { loadSavedCardInfo, removeSavedCard } from "@/lib/donations/saved-card";

/**
 * The donor's saved card, as the Account screen shows it: "Visa ending 4242", and a way to remove it.
 * Only for the signed-in donor (their token). Brand, last four digits and expiry only; the stored
 * token never leaves the server. Closed (404) until SAVED_CARDS=yes.
 */
export async function GET(request: NextRequest) {
  if (!savedCardsOpen()) return NextResponse.json({ ok: false, message: "Saved cards aren't switched on yet." }, { status: 404 });
  const account = await appAccount(request);
  if (!account) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  return NextResponse.json({ ok: true, card: await loadSavedCardInfo(account.userId) });
}

/** Remove the saved card, at once. Removing it twice is fine. */
export async function DELETE(request: NextRequest) {
  if (!savedCardsOpen()) return NextResponse.json({ ok: false, message: "Saved cards aren't switched on yet." }, { status: 404 });
  const account = await appAccount(request);
  if (!account) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  await removeSavedCard(account.userId);
  await logAudit({ actorUserId: account.userId, action: "saved_card.removed", entityType: "user", entityId: account.userId, details: {} });
  return NextResponse.json({ ok: true });
}
