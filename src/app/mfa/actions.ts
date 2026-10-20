"use server";

import { redirect } from "next/navigation";
import { logAudit } from "@/lib/audit";
import { safeNextPath } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/server";

export type EnrolState = { factorId?: string; qr?: string; secret?: string; error?: string };

/** Starts setting up an authenticator app. Clears any half-finished attempt first. */
export async function startEnrol(): Promise<EnrolState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Givezy ${Date.now()}` });
  if (error || !data) return { error: "We couldn't start the set-up. Please try again." };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Checks the 6-digit code (for a new or an existing authenticator) and lifts this sign-in to the second step. */
export async function verifyCode(formData: FormData) {
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const next = safeNextPath(formData.get("next"));
  const back = (error: string) => redirect(`/mfa?error=${error}&next=${encodeURIComponent(next)}`);
  if (!/^[0-9a-f-]{36}$/i.test(factorId) || !/^\d{6}$/.test(code)) back("code");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  // Whether this code finishes a new authenticator's set-up, or is a sign-in with an existing one.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const enrolling = (factors?.all ?? []).some((f) => f.id === factorId && f.status === "unverified");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) back("code");
  if (enrolling) {
    await logAudit({ actorUserId: user.id, action: "user.mfa_enrolled", entityType: "user", entityId: user.id }).catch((e) => console.error("[mfa] audit not written", e));
  }
  redirect(next);
}
