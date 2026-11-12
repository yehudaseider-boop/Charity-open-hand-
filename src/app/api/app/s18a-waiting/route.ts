import { NextResponse, type NextRequest } from "next/server";
import { appAccount } from "@/lib/app-auth";
import { giftsWaitingForS18aDetails } from "@/lib/donations/s18a-complete";
import { hitRateLimit } from "@/lib/rate-limit";

/**
 * For the phone app's Receipts screen: the signed-in donor's gifts that asked for an s18A receipt and are still
 * waiting for its details ("Add my details after paying"), wherever they were given (12/11/2026). The app leaves
 * them out of "Counts towards your s18A receipts", as the website's account page does. Only gift ids go back.
 */
export async function POST(request: NextRequest) {
  const who = await appAccount(request, { forMoney: true });
  if (!who) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  const limited = await hitRateLimit("app-s18a-waiting", [`user:${who.userId}`], 30, 10).catch((e) => (console.error(e), true));
  if (limited) return NextResponse.json({ ok: false, message: "Please wait a moment, then try again." }, { status: 429 });
  try {
    const waiting = await giftsWaitingForS18aDetails(who.userId);
    return NextResponse.json({ ok: true, waiting });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, message: "We couldn't check your s18A details just now. Please try again." }, { status: 503 });
  }
}
