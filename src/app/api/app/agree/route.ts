import { NextResponse, type NextRequest } from "next/server";
import { legalConfig } from "@/config/legal";
import { appAccount } from "@/lib/app-auth";
import { logAudit } from "@/lib/audit";
import { hitRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The phone app's "I agree" to the Terms and Privacy policy (24/11/2026). It used to call the database's
 * agree_to_policy() with the donor's own sign-in, which let anyone signed in record agreement to any version text.
 * Now the server records it, and only for the version it has: an app showing an older or newer version than ours is
 * told to update, and nothing is recorded. Only for the signed-in donor (their token; a password session is refused).
 * A second agreement to the same version counts as already recorded.
 */
export async function POST(request: NextRequest) {
  const who = await appAccount(request);
  if (!who) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  const limited = await hitRateLimit("app-agree", [`user:${who.userId}`], 20, 10).catch((e) => (console.error(e), true));
  if (limited) return NextResponse.json({ ok: false, message: "Please wait a moment, then try again." }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { version?: unknown } | null;
  if (!body || body.version !== legalConfig.policyVersion) {
    return NextResponse.json({ ok: false, message: "These terms have changed. Please update the app, then agree to the new ones. Nothing was saved." }, { status: 409 });
  }
  try {
    const db = createAdminClient();
    const { error } = await db.from("consents").insert({ kind: "account", policy_version: legalConfig.policyVersion, user_id: who.userId });
    // Already agreed to this version (a double tap, or agreed on the website): done.
    if (error && error.code === "23505") return NextResponse.json({ ok: true });
    if (error) throw error;
    await logAudit({ actorUserId: who.userId, action: "consent.account", entityType: "user", entityId: who.userId, details: { version: legalConfig.policyVersion, via: "app" } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[app-agree]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, message: "We couldn't save that. Nothing has changed. Please try again." }, { status: 503 });
  }
}
