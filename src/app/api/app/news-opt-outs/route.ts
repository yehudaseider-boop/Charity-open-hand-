import { NextResponse, type NextRequest } from "next/server";
import { appAccount } from "@/lib/app-auth";
import { newsOptOutsFor } from "@/lib/charity/news-opt-outs";
import { hitRateLimit } from "@/lib/rate-limit";

/**
 * For the phone app's "News from your charities": the charities the signed-in donor asked for "No news or appeals
 * from this charity" (24/11/2026; it was the database's my_news_opt_outs(), which can't work out keyed email
 * fingerprints). Only for the signed-in donor (their token; a password session is refused). Only charity ids go back.
 * If this fails, the app shows no news at all, never news they said no to.
 */
export async function POST(request: NextRequest) {
  const who = await appAccount(request);
  if (!who) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  const limited = await hitRateLimit("app-news-opt-outs", [`user:${who.userId}`], 60, 10).catch((e) => (console.error(e), true));
  if (limited) return NextResponse.json({ ok: false, message: "Please wait a moment, then try again." }, { status: 429 });
  try {
    return NextResponse.json({ ok: true, charityIds: await newsOptOutsFor(who.userId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[news-opt-outs]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, message: "We couldn't check your email choices just now. Please try again." }, { status: 503 });
  }
}
