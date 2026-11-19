import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { appAccount } from "@/lib/app-auth";
import { clientIp } from "@/lib/client-ip";
import { hitRateLimit, ipKeys } from "@/lib/rate-limit";
import { savedCardsOpen } from "@/lib/donations/app-api";
import { loadSavedCardInfo, removeSavedCard } from "@/lib/donations/saved-card";

/** The longest this may run (13/11/2026): a call to the payment provider can take up to 20 seconds. */
export const maxDuration = 60;

/** Each call asks the sign-in service twice: limited per internet address (security review 18/11/2026; generous, because many phones share one address on mobile networks). */
const busy = (request: NextRequest) => hitRateLimit("app-saved-card", ipKeys(clientIp(request.headers)), 300, 10).catch(() => false);
const BUSY = { ok: false, message: "Please wait a moment, then try again." };

/**
 * The donor's saved card, as the Account screen shows it: "Visa ending 4242", and a way to remove it.
 * Only for the signed-in donor (their token). Brand, last four digits and expiry only; the stored
 * token never leaves the server. Closed (404) until SAVED_CARDS=yes.
 */
export async function GET(request: NextRequest) {
  if (!savedCardsOpen()) return NextResponse.json({ ok: false, message: "Saved cards aren't switched on yet." }, { status: 404 });
  if (await busy(request)) return NextResponse.json(BUSY, { status: 429 });
  const account = await appAccount(request, { forMoney: true });
  if (!account) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  return NextResponse.json({ ok: true, card: await loadSavedCardInfo(account.userId) });
}

/** Remove the saved card, at once. Removing it twice is fine. */
export async function DELETE(request: NextRequest) {
  if (!savedCardsOpen()) return NextResponse.json({ ok: false, message: "Saved cards aren't switched on yet." }, { status: 404 });
  if (await busy(request)) return NextResponse.json(BUSY, { status: 429 });
  const account = await appAccount(request, { forMoney: true });
  if (!account) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  await removeSavedCard(account.userId);
  await logAudit({ actorUserId: account.userId, action: "saved_card.removed", entityType: "user", entityId: account.userId, details: {} });
  return NextResponse.json({ ok: true });
}
