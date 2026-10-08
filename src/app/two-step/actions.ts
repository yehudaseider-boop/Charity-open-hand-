"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { logAudit } from "@/lib/audit";
import { requireCharityAdmin } from "@/lib/auth";
import { hitRateLimit } from "@/lib/rate-limit";
import { safeAdminPath } from "@/lib/safe-path";
import { createClient } from "@/lib/supabase/server";

export type TwoStepState = {
  ok: boolean;
  message?: string;
  /** Set while someone is setting up their authenticator app. */
  enrolment?: { factorId: string; qrCode: string; secret: string };
};

/** Only back into the admin areas, never an outside address. */
function safeNext(next: FormDataEntryValue | null): string {
  return safeAdminPath(typeof next === "string" ? next : "");
}

/**
 * Six digits is a million possibilities, so guessing must be slow: at most
 * 5 tries per 15 minutes for each account and for each network address.
 */
async function tooManyTries(userId: string): Promise<boolean> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return hitRateLimit("two_step_code", [`user:${userId}`, `ip:${ip}`], 5, 15);
}
const slowDown = "Too many tries. Please wait 15 minutes and try again.";

function readCode(formData: FormData): string | null {
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

/**
 * Set up an authenticator app. The first press returns the QR code to scan;
 * the second checks the first code from the app, which proves it works.
 */
export async function setUpApp(prev: TwoStepState, formData: FormData): Promise<TwoStepState> {
  const viewer = await requireCharityAdmin();
  const supabase = await createClient();

  if (formData.get("step") === "confirm" && prev.enrolment) {
    const code = readCode(formData);
    if (!code) return { ...prev, ok: false, message: "Enter the 6-digit code from your app." };
    if (await tooManyTries(viewer.userId)) return { ...prev, ok: false, message: slowDown };
    // Supabase only accepts a factor that belongs to the signed-in person.
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: prev.enrolment.factorId, code });
    if (error) {
      return { ...prev, ok: false, message: "That code didn't work. Check your phone's time is set automatically and try the newest code." };
    }
    await logAudit({ actorUserId: viewer.userId, action: "auth.two_step_enrolled", entityType: "user", entityId: viewer.userId });
    redirect(safeNext(formData.get("next")));
  }

  // Clear any half-finished setup first, so only one app can be waiting.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${Date.now()}` });
  if (error || !data) return { ok: false, message: "We couldn't start the setup. Please try again." };
  return { ok: false, enrolment: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret } };
}

/** Second step at sign-in, for someone who has already set up their app. */
export async function verifyCode(_prev: TwoStepState, formData: FormData): Promise<TwoStepState> {
  const viewer = await requireCharityAdmin();
  const code = readCode(formData);
  if (!code) return { ok: false, message: "Enter the 6-digit code from your app." };
  if (await tooManyTries(viewer.userId)) return { ok: false, message: slowDown };

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp[0];
  if (!factor) return { ok: false, message: "No authenticator app is set up. Reload this page to set one up." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return { ok: false, message: "That code didn't work. Try the newest code in your app." };
  redirect(safeNext(formData.get("next")));
}
