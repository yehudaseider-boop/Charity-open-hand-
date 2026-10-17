"use server";

import { redirect } from "next/navigation";
import { signedInWithPassword } from "@/lib/auth";
import { safeNextPath } from "@/lib/mfa";
import { hitRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export type EnrolState = { factorId?: string; qr?: string; secret?: string; error?: string };

/** Starts setting up an authenticator app. Clears any half-finished attempt first. */
export async function startEnrol(): Promise<EnrolState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // A session started with a password may not set up a second step: it could belong to someone who
  // registered this email before its owner ever signed in (see auth.ts).
  if (!user || (await signedInWithPassword(supabase))) return { error: "Please sign in again." };
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
  if (!user || (await signedInWithPassword(supabase))) redirect(`/login?next=${encodeURIComponent(next)}`);
  // A code is six digits: a slow guess is still a guess. Ten tries, then a quarter of an hour.
  if (await hitRateLimit("mfa-code", [`user:${user.id}`], 10, 15)) back("busy");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) back("code");
  redirect(next);
}
