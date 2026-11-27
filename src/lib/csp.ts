/**
 * The site's Content-Security-Policy (security hardening 23/11/2026). Dependency-free and pure: next.config.ts (the
 * policy for statically built pages) and src/proxy.ts (the per-request nonce policy) both build theirs here, so the
 * two can differ only in how scripts are allowed.
 *
 * Two policies:
 *  - "nonce": scripts run only with this request's one-time nonce (and what those scripts load, 'strict-dynamic').
 *    No 'unsafe-inline' for scripts. For every page that handles sign-in, money or personal data. Next.js puts the
 *    nonce on its own scripts by itself, but only on pages rendered per request, so each such page must be dynamic.
 *  - "static": scripts allow 'unsafe-inline', because a page built ahead of time has no request to take a nonce from.
 *    For public pages (home, charities list, FAQ, for donors, for charities, terms, privacy, a charity's own page).
 */
// A relative path: next.config.ts reads this file too, outside the app's "@/" paths.
import { botCheckConfig } from "../config/bot-check";

export type CspPolicy = "nonce" | "static";

/**
 * Cloudflare's bot check (Turnstile, 23/11/2026): its script and its frame, on both policies. The nonce pages load
 * the script with the nonce (and 'strict-dynamic' lets it run); the host is named too, for browsers without
 * 'strict-dynamic', and on the static policy because moving from a public page to Sign in or Give without a full
 * page load keeps the public page's policy. No connect-src is needed (Cloudflare's CSP guide, 23/11/2026).
 */
export const BOT_CHECK_ORIGIN = botCheckConfig.origin;

/** Areas whose every page, and everything under it, gets the nonce policy (a path equal to it or starting "<it>/"). */
export const NONCE_AREAS = [
  "/account",
  "/admin",
  "/charity-admin",
  "/login",
  "/mfa",
  "/auth",
  "/agree",
  "/donate",
  "/receipts",
  "/documents",
  "/monthly",
  "/thanks",
  "/news",
  "/launch-list",
  "/apply",
  "/charities/request",
  "/test-gateway",
] as const;

/** A charity's give page: /c/<slug>/donate, and its redesign preview /preview/give/<slug> (review 27/11/2026). */
const GIVE_PAGE = /^\/(?:c\/[^/]+\/donate|preview\/give\/[^/]+)(?:\/|$)/;

/** Which policy a page address gets. Matched without regard to capital letters, so a strange spelling is never looser. */
export function cspPolicyFor(pathname: string): CspPolicy {
  const p = pathname.toLowerCase();
  if (GIVE_PAGE.test(p)) return "nonce";
  return NONCE_AREAS.some((area) => p === area || p.startsWith(`${area}/`)) ? "nonce" : "static";
}

/** A fresh, unguessable value for one request. */
export function newNonce(): string {
  return btoa(crypto.randomUUID());
}

export type CspInput = {
  /** Present for the "nonce" policy; absent for the "static" one. */
  nonce?: string;
  dev: boolean;
  /** Charity logos and covers come from here. */
  supabaseOrigin: string;
  /** The payment provider's own page, which a form on our site may land on (see checkout-origins.ts). */
  formActionOrigins: readonly string[];
  /** The two video players a charity's profile video may use. */
  videoFrameOrigins: readonly string[];
};

/**
 * frame-ancestors 'none' stops other sites showing our pages in a frame (clickjacking on checkout). form-action: our
 * forms only post to us, and may land on the payment provider's page. Once the page has loaded, that page is reached
 * by a script, but a tap before then is a plain form post, and the browser refuses to follow our redirect unless its
 * address is named here.
 */
export function buildCsp(i: CspInput): string {
  const scripts = i.nonce
    ? `script-src 'self' 'nonce-${i.nonce}' 'strict-dynamic' ${BOT_CHECK_ORIGIN}${i.dev ? " 'unsafe-eval'" : ""}`
    : `script-src 'self' 'unsafe-inline' ${BOT_CHECK_ORIGIN}${i.dev ? " 'unsafe-eval'" : ""}`;
  return [
    "default-src 'self'",
    scripts,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${i.supabaseOrigin ? ` ${i.supabaseOrigin}` : ""}`,
    "font-src 'self'",
    // A charity's profile video plays in a frame, only after the visitor presses play: exactly these two players, nothing wider,
    // and Cloudflare's bot check, whose tick box (when it shows one) is a frame from its own address.
    `frame-src ${[...i.videoFrameOrigins, BOT_CHECK_ORIGIN].join(" ")}`,
    `connect-src 'self'${i.dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    ["form-action 'self'", ...i.formActionOrigins].join(" "),
    "frame-ancestors 'none'",
    ...(i.dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
