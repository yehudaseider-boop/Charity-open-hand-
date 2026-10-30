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
  let next = safeNext(formData.get("next"));
  // Started from the apply page (name and email in one form): the organisation name comes back filled in.
  const applyName = String(formData.get("apply_name") ?? "").trim().slice(0, 120);
  if (applyName && next.split("?")[0] === "/apply") {
    const url = new URL(next, "https://givezy.invalid");
    url.searchParams.set("name", applyName);
    next = `${url.pathname}${url.search}`;
  }
  // Keep what they typed if we send them back with a message.
  const back = (error: string) => `/login?error=${error}&next=${encodeURIComponent(next)}&email=${encodeURIComponent(email.slice(0, 200))}`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect(back("email"));
  const requestHeaders = await headers();
  // Per address as well as per email, so one visitor cannot send sign-in links to many addresses.
  // If the check itself fails (a database hiccup), send them back with what they typed, not to an error page.
  let limited: boolean;
  try {
    limited = (await hitRateLimit("login-link", [`email:${email.toLowerCase()}`], 5, 60)) || (await hitRateLimit("login-link", ipKeys(clientIp(requestHeaders)), 20, 60));
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
  let limited: boolean;
  try {
    limited = await hitRateLimit("login-code", [`email:${email.toLowerCase()}`, ...ipKeys(clientIp(await headers()))], 10, 60);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    redirect(back);
  }
  if (limited) redirect(back);
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
