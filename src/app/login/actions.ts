"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { platformConfig } from "@/config/platform";
import { clientIp } from "@/lib/client-ip";
import { hitRateLimit, rateLimitReached } from "@/lib/rate-limit";
import { siteOrigin } from "@/lib/request-origin";
import { safeNextPath } from "@/lib/safe-path";
import { looksLikeEmail, sentPageUrl, signInKeys } from "@/lib/sign-in";
import { createClient } from "@/lib/supabase/server";
import { linkDonorsToUser } from "@/lib/donors/link";

const safeNext = (next: FormDataEntryValue | null) => safeNextPath(next);
const guard = platformConfig.signInGuard;

/** The apply page's own form (organisation name and email together): its messages show there, not on Sign in. */
const isApplyPath = (path: string) => path.split("?")[0] === "/apply";

export async function sendLoginLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  let next = safeNext(formData.get("next"));
  // Started from the apply page (name and email in one form): the organisation name comes back filled in.
  const fromApply = formData.has("apply_name") && isApplyPath(next);
  const applyName = String(formData.get("apply_name") ?? "").trim().slice(0, 120);
  if (applyName && isApplyPath(next)) {
    const url = new URL(next, "https://givezy.invalid");
    url.searchParams.set("name", applyName);
    next = `${url.pathname}${url.search}`;
  }
  // Keep what they typed if we send them back with a message: to the apply page when they started there (both
  // fields kept), otherwise to Sign in.
  const back = (error: string) => {
    if (fromApply) {
      const url = new URL(next, "https://givezy.invalid");
      url.searchParams.set("error", error);
      url.searchParams.set("email", email.slice(0, 200));
      return `${url.pathname}${url.search}`;
    }
    return `/login?error=${error}&next=${encodeURIComponent(next)}&email=${encodeURIComponent(email.slice(0, 200))}`;
  };
  if (email.length > 254 || !looksLikeEmail(email)) redirect(back("email"));
  const requestHeaders = await headers();
  // Counted per email on this connection, so a stranger asking for links to someone's email cannot stop that person
  // asking from their own phone; each email and each address also has a ceiling of its own (platformConfig.signInGuard).
  // If the check itself fails (a database hiccup), send them back with what they typed, not to an error page.
  const keys = signInKeys(email, clientIp(requestHeaders));
  let limited: boolean;
  try {
    limited =
      (await hitRateLimit("login-link-pair", keys.pair, guard.linksPerEmailAndAddress.tries, guard.linksPerEmailAndAddress.minutes)) ||
      (await hitRateLimit("login-link-email", keys.email, guard.linksPerEmail.tries, guard.linksPerEmail.minutes)) ||
      (await hitRateLimit("login-link", keys.address, guard.linksPerAddress.tries, guard.linksPerAddress.minutes));
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    redirect(back("send"));
  }
  if (limited) redirect(back("busy"));

  const origin = siteOrigin(requestHeaders.get("origin") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) redirect(back("send"));
  // The address shows on "Check your email" only with our own short-lived proof (lib/sign-in.ts), so a link
  // someone else makes can't say we sent an email to any address they like.
  redirect(sentPageUrl(email, next));
}

/**
 * The 6-digit code from the same email. Works on any device, unlike the link, which only opens
 * in the browser that asked for it (a link tapped in the Gmail app opens in another one).
 *
 * Only wrong codes count towards the limits, per email on this connection, with a much higher ceiling per email and
 * one per address: a stranger typing wrong codes for someone's email cannot lock that person out.
 */
export async function verifyLoginCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const next = safeNext(formData.get("next"));
  // Back to the code box: the address stays only with the proof the page already had (never a new one from here).
  const proof = String(formData.get("s") ?? "");
  const back = (error: "code" | "tries") => sentPageUrl(email, next, { error }, proof);
  if (email.length > 254 || !looksLikeEmail(email) || !/^\d{6,10}$/.test(code)) redirect(back("code"));
  const keys = signInKeys(email, clientIp(await headers()));
  let limited: boolean;
  try {
    limited =
      (await rateLimitReached("login-code-pair", keys.pair, guard.wrongCodesPerEmailAndAddress.tries, guard.wrongCodesPerEmailAndAddress.minutes)) ||
      (await rateLimitReached("login-code-email", keys.email, guard.wrongCodesPerEmail.tries, guard.wrongCodesPerEmail.minutes)) ||
      (await rateLimitReached("login-code", keys.address, guard.wrongCodesPerAddress.tries, guard.wrongCodesPerAddress.minutes));
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    redirect(back("code"));
  }
  if (limited) redirect(back("tries"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user) {
    // A wrong code: counted now (a right one never is). A failed count never stops the message.
    try {
      await hitRateLimit("login-code-pair", keys.pair, guard.wrongCodesPerEmailAndAddress.tries, guard.wrongCodesPerEmailAndAddress.minutes);
      await hitRateLimit("login-code-email", keys.email, guard.wrongCodesPerEmail.tries, guard.wrongCodesPerEmail.minutes);
      await hitRateLimit("login-code", keys.address, guard.wrongCodesPerAddress.tries, guard.wrongCodesPerAddress.minutes);
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
    }
    redirect(back("code"));
  }
  // Signing in proves they own this email address: attach their past donations.
  try {
    if (data.user.email) await linkDonorsToUser(data.user.id, data.user.email);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e); // never block signing in
  }
  redirect(next);
}
