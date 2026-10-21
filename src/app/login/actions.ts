"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp } from "@/lib/client-ip";
import { hitRateLimit, ipKeys } from "@/lib/rate-limit";
import { siteOrigin } from "@/lib/request-origin";
import { safeNextPath } from "@/lib/safe-path";
import { createClient } from "@/lib/supabase/server";
import { linkDonorsToUser } from "@/lib/donors/link";

const safeNext = (next: FormDataEntryValue | null) => safeNextPath(next);

export async function sendLoginLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const next = safeNext(formData.get("next"));
  // Keep what they typed if we send them back with a message.
  const back = (error: string) => `/login?error=${error}&next=${encodeURIComponent(next)}&email=${encodeURIComponent(email.slice(0, 200))}`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect(back("email"));
  const requestHeaders = await headers();
  // Per address as well as per email, so one visitor cannot send sign-in links to many addresses.
  if ((await hitRateLimit("login-link", [`email:${email.toLowerCase()}`], 5, 60)) || (await hitRateLimit("login-link", ipKeys(clientIp(requestHeaders)), 20, 60))) {
    redirect(back("busy"));
  }

  const origin = siteOrigin(requestHeaders.get("origin") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) redirect(back("send"));
  redirect(`/login?sent=1&next=${encodeURIComponent(next)}&email=${encodeURIComponent(email.slice(0, 200))}`);
}

/**
 * The 6-digit code from the same email. Works on any device, unlike the link, which only opens
 * in the browser that asked for it (a link tapped in the Gmail app opens in another one).
 */
export async function verifyLoginCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const next = safeNext(formData.get("next"));
  const back = `/login?sent=1&error=code&next=${encodeURIComponent(next)}&email=${encodeURIComponent(email.slice(0, 200))}`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6,10}$/.test(code)) redirect(back);
  if (await hitRateLimit("login-code", [`email:${email.toLowerCase()}`, `ip:${clientIp(await headers())}`], 10, 60)) redirect(back);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user) redirect(back);
  // Signing in proves they own this email address: attach their past donations.
  try {
    if (data.user.email) await linkDonorsToUser(data.user.id, data.user.email);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e); // never block signing in
  }
  redirect(next);
}
