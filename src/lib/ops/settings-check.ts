/**
 * The Settings check on the admin pages: is each setting on the host present and in the right shape? It
 * never returns a value, only a tick or a problem in plain words, so the page can be shown to anyone who
 * can see the admin pages. Pure: give it the environment.
 */
import { gatewaySettings } from "@/lib/gateway/settings";

export type SettingCheck = { name: string; status: "ok" | "fix" | "later"; says: string };

type Env = Record<string, string | undefined>;

/** The live site, the test site, or not known yet (SITE_URL not set). */
export function siteKind(env: Env): "live" | "test" | "unknown" {
  try {
    const host = new URL(env.SITE_URL ?? "").hostname;
    return host.startsWith("test.") || host.endsWith(".vercel.app") || host === "localhost" || host === "127.0.0.1" ? "test" : "live";
  } catch {
    return "unknown";
  }
}

const email = (s: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s);

export function settingsCheck(env: Env): SettingCheck[] {
  const site = siteKind(env);
  const out: SettingCheck[] = [];
  const add = (name: string, status: SettingCheck["status"], says: string) => out.push({ name, status, says });

  // Database
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!url) add("NEXT_PUBLIC_SUPABASE_URL", "fix", "Missing. Nothing works without it.");
  else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) add("NEXT_PUBLIC_SUPABASE_URL", "fix", "Should look like https://<project>.supabase.co, from Supabase, Project Settings, API.");
  else add("NEXT_PUBLIC_SUPABASE_URL", "ok", "Set.");
  const pub = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  const secret = env.SUPABASE_SECRET_KEY ?? "";
  add("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", pub ? "ok" : "fix", pub ? "Set." : "Missing. Nothing works without it.");
  if (!secret) add("SUPABASE_SECRET_KEY", "fix", "Missing. Payments, receipts and the admin pages need it.");
  else if (secret === pub) add("SUPABASE_SECRET_KEY", "fix", "The same as the publishable key. Paste the secret key here.");
  else if (secret.startsWith("sb_publishable_")) add("SUPABASE_SECRET_KEY", "fix", "This is the publishable key. Paste the secret key (sb_secret_) here.");
  else add("SUPABASE_SECRET_KEY", "ok", "Set.");

  // Encryption
  const enc = env.ENCRYPTION_KEY ?? "";
  if (!enc) add("ENCRYPTION_KEY", "fix", "Missing. Bank, ID and tax numbers can't be saved or read.");
  else if (Buffer.from(enc, "base64").length !== 32) add("ENCRYPTION_KEY", "fix", "Wrong length: it must be 32 random bytes in base64 (44 characters ending in =).");
  else add("ENCRYPTION_KEY", "ok", "Set. Keep the backup copy safe: without it, saved bank, ID and tax numbers can't be read.");

  // The site's address
  const site_url = env.SITE_URL ?? "";
  if (!site_url) add("SITE_URL", "fix", "Missing. Set it once the domain works, for example https://test.givezy.co.za. Sign-in links and payments need it.");
  else if (!/^https:\/\/[a-z0-9.-]+$/.test(site_url)) add("SITE_URL", "fix", "Should be https:// and the address only, with no slash or path at the end.");
  else add("SITE_URL", "ok", site === "test" ? "The test site." : "The live site.");

  // Host details
  if (env.VERCEL) {
    const ip = (env.CLIENT_IP_HEADER ?? "").toLowerCase();
    add("CLIENT_IP_HEADER", ip === "x-real-ip" ? "ok" : "fix", ip === "x-real-ip" ? "Set." : "Should be x-real-ip on Vercel, so the limits on repeated tries count each person separately.");
    if (env.CHROME_PATH) add("CHROME_PATH", "fix", "Leave empty on Vercel: it is for running the site on your own computer. Receipt PDFs fail with it set.");
  }
  const cron = env.CRON_SECRET ?? "";
  if (!cron) add("CRON_SECRET", "fix", "Missing. The daily job (monthly donations, payment checks) refuses to run without it.");
  else if (cron.length < 32) add("CRON_SECRET", "fix", "Too short. Use a long random string, at least 32 characters.");
  else add("CRON_SECRET", "ok", "Set.");

  // Payments
  out.push(...gatewaySettings(env, site));

  // Email
  const transport = env.EMAIL_TRANSPORT || "console";
  if (transport === "console") add("EMAIL_TRANSPORT", "later", "Not set up yet: confirmation and receipt emails are only written to the log, not sent.");
  else if (transport !== "resend") add("EMAIL_TRANSPORT", "fix", "Not an email service we know. Use resend.");
  else {
    add("EMAIL_TRANSPORT", "ok", "Resend.");
    add("RESEND_API_KEY", env.RESEND_API_KEY ? "ok" : "fix", env.RESEND_API_KEY ? "Set." : "Missing. No email can be sent.");
    const from = env.EMAIL_FROM ?? "";
    const addr = /<([^>]+)>\s*$/.exec(from)?.[1] ?? from.trim();
    add("EMAIL_FROM", email(addr) ? "ok" : "fix", email(addr) ? "Set." : "Should be like Givezy <hello@givezy.co.za>, on the domain set up in Resend.");
  }
  const allow = (env.EMAIL_ALLOWLIST ?? "").trim();
  if (site === "live" && allow) add("EMAIL_ALLOWLIST", "fix", "Set on the live site: donors outside the list would never get their emails. Remove it.");
  else if (site !== "live" && !allow && transport === "resend") add("EMAIL_ALLOWLIST", "fix", "Must be set on the test site, so a test never emails a real donor.");
  else if (allow) add("EMAIL_ALLOWLIST", "ok", "Set: only listed addresses get email.");
  const admin = env.ADMIN_NOTIFY_EMAIL ?? "";
  add("ADMIN_NOTIFY_EMAIL", email(admin) ? "ok" : "fix", email(admin) ? "Set." : admin ? "Doesn't look like an email address." : "Missing. Chargebacks, new applications and the daily \"needs a person\" email have nowhere to go.");

  // Switches that stay off for launch
  add("APP_GIVING", env.APP_GIVING === "yes" ? "later" : "ok", env.APP_GIVING === "yes" ? "On: the app can take gifts. Keep it off until Apple and Google confirm in writing." : "Off: the app sends people to the website to give.");
  add("SAVED_CARDS", env.SAVED_CARDS === "yes" ? "later" : "ok", env.SAVED_CARDS === "yes" ? "On. Off for launch until the consent wording is agreed." : "Off.");
  const receipts = env.RECEIPTS_ENABLED === "yes" && env.RECEIPT_WORDING_CONFIRMED === "yes";
  add("RECEIPTS_ENABLED", receipts ? "ok" : "later", receipts ? "On: s18A receipts are issued." : "Off: s18A receipts stay drafts until Yosef approves the wording.");
  return out;
}
