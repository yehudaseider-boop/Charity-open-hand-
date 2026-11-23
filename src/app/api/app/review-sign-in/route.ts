import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { clientIp } from "@/lib/client-ip";
import { hitRateLimit, ipKeys, rateLimitReached } from "@/lib/rate-limit";
import { isReviewSignIn, reviewSignIn, reviewTokenType } from "@/lib/review-sign-in";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The app reviewer's sign-in with a fixed code (22/11/2026, see src/lib/review-sign-in.ts). The app asks here only
 * after Supabase turned the typed code down. For the reviewer's email and code, it returns a one-time sign-in token
 * that the app exchanges with Supabase for a normal session (the same kind an emailed code gives). Anything else gets
 * the same plain refusal. Off unless both settings are there.
 *
 * Only an empty donor account is ever signed in (review 22/11/2026): never one that manages a charity, is a Givezy
 * admin, has given, or has an ID number saved, so a setting typed wrong can't open anyone's dashboard, Admin or giving.
 * Those checks run before any sign-in token is made, and a check that can't be done refuses.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };
const answer = (status: number, message: string) => NextResponse.json({ ok: false, message }, { status, headers: NO_STORE });
const refused = () => answer(401, "That code didn't work or has expired. Check it, or tap Send a new code.");
const unavailable = () => answer(503, "Sign-in isn't available just now. Please try again in a minute.");

// Per address, every try counts, whatever the email. In all, only the reviewer's wrong codes count, and the allowance is wide, so someone who knows the
// reviewer's email can't easily lock the reviewer out; a code of 8 or more digits still can't be guessed at this rate.
const PER_ADDRESS_PER_HOUR = 10;
const WRONG_CODES_PER_HOUR = 50;

export async function POST(request: NextRequest) {
  const setting = reviewSignIn();
  if (!setting) return answer(404, "Not available.");
  const body = (await request.json().catch(() => null)) as { email?: unknown; code?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  // Every try is counted per address, and the limits are checked, before the email is compared (security review
  // 23/11/2026): any email gets the same answers at the same point, so nobody can find the reviewer's email by which
  // one is ever told "too many tries".
  const ip = ipKeys(clientIp(request.headers));
  try {
    if (await hitRateLimit("review-sign-in-ip", ip, PER_ADDRESS_PER_HOUR, 60)) return answer(429, "Too many tries. Please wait an hour and try again.");
    if (await rateLimitReached("review-sign-in-wrong", ["review#all"], WRONG_CODES_PER_HOUR, 60)) return answer(429, "Too many tries. Please wait an hour and try again.");
  } catch (e) {
    console.error("[review sign-in] limit check failed", e);
    return unavailable();
  }
  // Everyone else's mistyped code is refused, without counting against the reviewer's wrong codes in all.
  if (email !== setting.email) return refused();

  if (!isReviewSignIn(setting, body?.email, body?.code)) {
    try {
      await hitRateLimit("review-sign-in-wrong", ["review#all"], WRONG_CODES_PER_HOUR, 60);
      // Recorded, so a run of guesses shows in the audit log, not only as counted tries.
      await logAudit({ actorUserId: null, action: "auth.review_sign_in_refused", entityType: "user", entityId: null, details: { reason: "wrong_code" } });
    } catch (e) {
      console.error("[review sign-in] could not count a wrong code", e);
    }
    return refused();
  }

  const db = createAdminClient();
  // The account first, by its email, before any sign-in token is made for it.
  const { data: profile, error: profileError } = await db.from("profiles").select("id, role").eq("email", setting.email).maybeSingle();
  if (profileError) {
    console.error("[review sign-in] could not look up the account", profileError.message);
    return unavailable();
  }
  // The account is made when the app sends a code: "Send code" first, then type the fixed code.
  if (!profile) return answer(409, "Tap Send code first, then type the code.");

  const empty = await isEmptyDonorAccount(db, profile.id as string, setting.email, profile.role as string);
  if (empty === null) return unavailable();
  if (!empty) {
    console.error("[review sign-in] refused: the reviewer account isn't an empty donor account");
    await logAudit({ actorUserId: null, action: "auth.review_sign_in_refused", entityType: "user", entityId: profile.id as string, details: { reason: "not_an_empty_donor_account" } }).catch(() => {});
    return refused();
  }

  const link = await db.auth.admin.generateLink({ type: "magiclink", email: setting.email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash || link.data?.user?.id !== profile.id) {
    console.error("[review sign-in] no sign-in token", link.error?.message ?? "a different account came back");
    return unavailable();
  }
  try {
    await logAudit({ actorUserId: profile.id as string, action: "auth.review_sign_in", entityType: "user", entityId: profile.id as string });
  } catch (e) {
    console.error("[review sign-in] could not record the sign-in", e);
    return unavailable();
  }
  // A brand-new account's token is a sign-up one; the app passes the kind back to Supabase with it.
  return NextResponse.json({ ok: true, tokenHash, type: reviewTokenType(link.data?.properties?.verification_type) }, { headers: NO_STORE });
}

/**
 * Whether the account has nothing to protect: not a Givezy admin, managing no charity, and no gifts or ID number under
 * its user or its email. Null when it couldn't be checked.
 */
async function isEmptyDonorAccount(db: ReturnType<typeof createAdminClient>, userId: string, email: string, role: string): Promise<boolean | null> {
  if (role !== "user") return false;
  const [admins, byUser, byEmail] = await Promise.all([
    db.from("charity_admins").select("user_id", { count: "exact", head: true }).eq("user_id", userId),
    db.from("donors").select("id, id_number_encrypted").eq("user_id", userId),
    db.from("donors").select("id, id_number_encrypted").eq("email", email),
  ]);
  if (admins.error || byUser.error || byEmail.error) {
    console.error("[review sign-in] could not check the account", admins.error?.message ?? byUser.error?.message ?? byEmail.error?.message);
    return null;
  }
  if ((admins.count ?? 0) > 0) return false;
  const donors = [...(byUser.data ?? []), ...(byEmail.data ?? [])] as { id: string; id_number_encrypted: string | null }[];
  if (donors.some((d) => d.id_number_encrypted)) return false;
  if (donors.length === 0) return true;
  const gifts = await db.from("donations").select("id", { count: "exact", head: true }).in("donor_id", [...new Set(donors.map((d) => d.id))]);
  if (gifts.error) {
    console.error("[review sign-in] could not check the account's gifts", gifts.error.message);
    return null;
  }
  return (gifts.count ?? 0) === 0;
}
