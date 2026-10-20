"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp } from "@/lib/client-ip";
import { hitRateLimit, ipKeys } from "@/lib/rate-limit";
import { siteOrigin } from "@/lib/request-origin";
import { safeNextPath } from "@/lib/safe-path";
import { createClient } from "@/lib/supabase/server";

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
  redirect(`/login?sent=1`);
}
