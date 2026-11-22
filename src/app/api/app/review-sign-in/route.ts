import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { clientIp } from "@/lib/client-ip";
import { hitRateLimit, ipKeys } from "@/lib/rate-limit";
import { isReviewSignIn, reviewSignIn } from "@/lib/review-sign-in";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The app reviewer's sign-in with a fixed code (22/11/2026, see src/lib/review-sign-in.ts). The app asks here only
 * after Supabase turned the typed code down. For the reviewer's email and code, it returns a one-time sign-in token
 * that the app exchanges with Supabase for a normal session (the same kind an emailed code gives). Anything else gets
 * the same plain refusal. Refused for an account that manages a charity or is a Givezy admin, so a setting typed
 * wrong can never open a charity's dashboard or Admin. Off unless both settings are there.
 */
export const dynamic = "force-dynamic";

const refused = () => NextResponse.json({ ok: false, message: "That code didn't work or has expired. Check it, or tap Send a new code." }, { status: 401, headers: { "cache-control": "no-store" } });

export async function POST(request: NextRequest) {
  const setting = reviewSignIn();
  if (!setting) return NextResponse.json({ ok: false, message: "Not available." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { email?: unknown; code?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  // Everyone else's mistyped code is simply refused, without counting against the reviewer's tries.
  if (email !== setting.email) return refused();

  try {
    // A few tries an hour, in all and per address: the fixed code can't be guessed.
    const limits: [string, string[], number][] = [["review-sign-in", ["review#all"], 20], ["review-sign-in-ip", ipKeys(clientIp(request.headers)), 10]];
    for (const [bucket, keys, limit] of limits) {
      if (await hitRateLimit(bucket, keys, limit, 60)) return NextResponse.json({ ok: false, message: "Too many tries. Please wait an hour and try again." }, { status: 429 });
    }
  } catch (e) {
    console.error("[review sign-in] limit check failed", e);
    return NextResponse.json({ ok: false, message: "Sign-in isn't available just now. Please try again in a minute." }, { status: 503 });
  }
  if (!isReviewSignIn(setting, body?.email, body?.code)) return refused();

  const db = createAdminClient();
  const link = await db.auth.admin.generateLink({ type: "magiclink", email: setting.email });
  const userId = link.data?.user?.id;
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !userId || !tokenHash) {
    // The account is made when the app sends a code: "Send code" first, then type the fixed code.
    console.error("[review sign-in] no sign-in token", link.error?.message);
    return NextResponse.json({ ok: false, message: "Tap Send code first, then type the code." }, { status: 409 });
  }
  const [{ data: profile }, { count }] = await Promise.all([
    db.from("profiles").select("role").eq("id", userId).maybeSingle(),
    db.from("charity_admins").select("user_id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  if (profile?.role === "platform_admin" || (count ?? 0) > 0) {
    console.error("[review sign-in] refused: the reviewer account manages a charity or is a Givezy admin");
    return refused();
  }
  await logAudit({ actorUserId: userId, action: "auth.review_sign_in", entityType: "user", entityId: userId });
  return NextResponse.json({ ok: true, tokenHash }, { headers: { "cache-control": "no-store" } });
}
