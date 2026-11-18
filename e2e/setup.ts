/**
 * What the end-to-end checks share: where the test site is, a robot account on the TEST database, a fresh sign-in
 * code for it (straight from Supabase, so no email is sent), and a browser.
 *
 * Settings (GitHub Actions secrets and variables, or your shell):
 *   E2E_SITE                    the test website (default https://test.givezy.co.za)
 *   E2E_SUPABASE_URL            the TEST Supabase project's address
 *   E2E_SUPABASE_PUBLISHABLE_KEY the TEST project's public key
 *   E2E_SUPABASE_SECRET_KEY     the TEST project's secret key (only for the robot's sign-in codes)
 *   E2E_APP_URL                 where the phone app's web build is served (the app checks skip without it)
 *   CHROMIUM_PATH               a Chromium to use, if Playwright's own isn't installed
 * Never point these at the live project: the robot creates its own account and agrees to the Terms.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium, type Browser } from "playwright-core";

export const SITE = (process.env.E2E_SITE ?? "https://test.givezy.co.za").replace(/\/+$/, "");
export const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "";
export const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY ?? "";
const SECRET_KEY = process.env.E2E_SUPABASE_SECRET_KEY ?? "";
export const APP_URL = (process.env.E2E_APP_URL ?? "").replace(/\/+$/, "");
/** The robot's own address. Nothing is ever emailed to it: codes come straight from Supabase. */
export const ROBOT_EMAIL = process.env.E2E_ROBOT_EMAIL ?? "e2e-robot@givezy.co.za";
/** The test site's demo charity. */
export const CHARITY_SLUG = process.env.E2E_CHARITY ?? "demo-charity";

/** Sign-in checks need the TEST project's keys; without them they are skipped, with a note. */
export const canSignIn = Boolean(SUPABASE_URL && PUBLISHABLE_KEY && SECRET_KEY);
if (!canSignIn) console.warn("[e2e] E2E_SUPABASE_URL, E2E_SUPABASE_PUBLISHABLE_KEY or E2E_SUPABASE_SECRET_KEY missing: sign-in checks skipped.");
if (/live|prod/i.test(SUPABASE_URL)) throw new Error("[e2e] This looks like a live project. The robot only runs against TEST.");

let admin: SupabaseClient | null = null;
function adminClient(): SupabaseClient {
  admin ??= createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

/** The robot's account exists (made once, already confirmed). */
export async function ensureRobot(): Promise<void> {
  const { error } = await adminClient().auth.admin.createUser({ email: ROBOT_EMAIL, email_confirm: true });
  if (error && !/already|registered|exists/i.test(error.message)) throw new Error(`Could not make the robot's account: ${error.message}`);
}

/** A fresh one-time sign-in for the robot, exactly what the email would hold: the code and its hashed form. */
export async function freshSignIn(): Promise<{ code: string; tokenHash: string }> {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: "magiclink", email: ROBOT_EMAIL });
  if (error || !data?.properties?.email_otp || !data.properties.hashed_token) throw new Error(`Supabase gave no sign-in code: ${error?.message ?? "empty answer"}`);
  return { code: data.properties.email_otp, tokenHash: data.properties.hashed_token };
}

export async function openBrowser(): Promise<Browser> {
  return chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
}

/** Text that means a page failed to load what it should, on any page (our "couldn't load" and error screens). */
export const BROKEN = /couldn.t load|something went wrong|application error|unhandled|this page could not be found/i;
