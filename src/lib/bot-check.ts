import "server-only";
import { botCheckConfig, BOT_CHECK_FAILS_OPEN, type BotCheckAction } from "@/config/bot-check";

/**
 * The server's half of the bot check (Cloudflare Turnstile, 23/11/2026). See src/config/bot-check.ts for the switch
 * and for which forms fail open when Cloudflare is unreachable. Never logs a token or the secret.
 */

type Env = Record<string, string | undefined>;

/** On only when both keys are set. Off, every protected form behaves exactly as before. */
export function botCheckOn(env: Env = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() && env.TURNSTILE_SECRET_KEY?.trim());
}

/** What a page needs to show the check: the public site key, or null when the check is off. */
export function botCheckSiteKey(env: Env = process.env): string | null {
  return botCheckOn(env) ? env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!.trim() : null;
}

/**
 * The addresses a token may have been earned on: the site's own (SITE_URL), and on a developer's machine the local
 * ones. Cloudflare's widget also lists only our addresses, so a token from anyone else's page is refused twice over.
 */
export function allowedHostnames(env: Env = process.env): string[] {
  const hosts: string[] = [];
  try {
    if (env.SITE_URL) hosts.push(new URL(env.SITE_URL).hostname.toLowerCase());
  } catch {
    // A malformed SITE_URL is caught by the Settings check; nothing is added for it here.
  }
  if (env.NODE_ENV !== "production") hosts.push("localhost", "127.0.0.1");
  return [...new Set(hosts)];
}

export type BotCheckResult =
  /** Passed, or the check is off, or Cloudflare was unreachable on a form that fails open. */
  | { ok: true; skipped?: "off" | "cloudflare-unreachable" }
  /** missing: no token came with the form. refused: Cloudflare (or our own checks) said no. unreachable: no answer. */
  | { ok: false; reason: "missing" | "refused" | "unreachable" };

type Siteverify = {
  success?: unknown;
  hostname?: unknown;
  action?: unknown;
  "error-codes"?: unknown;
  metadata?: { result_with_testing_key?: unknown };
};

/** Cloudflare's answers that mean "we couldn't decide", not "this token is bad": treated like no answer at all. */
const NOT_A_VERDICT = new Set(["internal-error", "missing-input-secret", "invalid-input-secret", "bad-request"]);

/**
 * Check one token with Cloudflare. Tokens are single-use and last 300 seconds; the browser gets a fresh one after
 * each press. `fetchImpl` and `env` are for tests.
 */
export async function verifyBotCheck(args: {
  token: FormDataEntryValue | null | undefined;
  action: BotCheckAction;
  ip: string;
  env?: Env;
  fetchImpl?: typeof fetch;
}): Promise<BotCheckResult> {
  const env = args.env ?? process.env;
  if (!botCheckOn(env)) return { ok: true, skipped: "off" };
  const token = typeof args.token === "string" ? args.token.trim() : "";
  if (!token) return { ok: false, reason: "missing" };
  if (token.length > botCheckConfig.maxTokenLength) return { ok: false, reason: "refused" };

  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY!.trim(), response: token });
  if (args.ip && args.ip !== "unknown") body.set("remoteip", args.ip);

  let answer: Siteverify;
  try {
    const res = await (args.fetchImpl ?? fetch)(botCheckConfig.siteverifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(botCheckConfig.verifyTimeoutMs),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`siteverify answered ${res.status}`);
    answer = (await res.json()) as Siteverify;
  } catch (e) {
    const why = !(e instanceof Error) ? "no answer" : e.name === "TimeoutError" || e.name === "AbortError" ? "timed out" : e.message;
    return unreachable(args.action, why);
  }

  const codes = Array.isArray(answer["error-codes"]) ? answer["error-codes"].filter((c): c is string => typeof c === "string") : [];
  if (answer.success !== true) {
    if (codes.some((c) => NOT_A_VERDICT.has(c))) return unreachable(args.action, `cloudflare said ${codes.join(", ")}`);
    console.warn(`[bot-check] ${args.action}: refused (${codes.join(", ") || "no reason given"})`);
    return { ok: false, reason: "refused" };
  }
  // Cloudflare's test keys (local only) pass every token and report hostname example.com with no action, so these two
  // checks are meaningless for them. A test secret passes everything anyway, so skipping them weakens nothing.
  if (answer.metadata?.result_with_testing_key === true) return { ok: true };
  const hostname = typeof answer.hostname === "string" ? answer.hostname.toLowerCase() : "";
  if (!allowedHostnames(env).includes(hostname)) {
    console.warn(`[bot-check] ${args.action}: refused (earned on another address)`);
    return { ok: false, reason: "refused" };
  }
  if (answer.action !== args.action) {
    console.warn(`[bot-check] ${args.action}: refused (earned on another form)`);
    return { ok: false, reason: "refused" };
  }
  return { ok: true };
}

/** Cloudflare didn't answer: closed or open by the form's own rule, logged either way. */
function unreachable(action: BotCheckAction, why: string): BotCheckResult {
  if (BOT_CHECK_FAILS_OPEN[action]) {
    console.warn(`[bot-check] ${action}: Cloudflare unreachable (${why}); let through on the other checks`);
    return { ok: true, skipped: "cloudflare-unreachable" };
  }
  console.error(`[bot-check] ${action}: Cloudflare unreachable (${why}); refused`);
  return { ok: false, reason: "unreachable" };
}
