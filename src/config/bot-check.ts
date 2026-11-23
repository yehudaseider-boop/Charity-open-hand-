/**
 * The bot check on the website's forms that send email or start a payment (Cloudflare Turnstile, decided 23/11/2026).
 * Dependency-free: the browser's check and the server's verification both read it. No key lives here: the site key
 * is NEXT_PUBLIC_TURNSTILE_SITE_KEY and the secret TURNSTILE_SECRET_KEY, both on the host (see .env.example). The
 * check is on only when both are set; otherwise every form works exactly as it did before.
 */
export const botCheckConfig = {
  /** Where the browser's check comes from (frame and script), for the Content-Security-Policy. */
  origin: "https://challenges.cloudflare.com",
  /** Loaded once, from Cloudflare's own address (never copied or cached here: Cloudflare updates it). */
  scriptUrl: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
  /** The server's question to Cloudflare: was this token really earned on our page? */
  siteverifyUrl: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  /** How long the server waits for Cloudflare's answer before treating it as unreachable. */
  verifyTimeoutMs: 4000,
  /** How long the browser waits for Cloudflare's script before saying it couldn't load. */
  scriptTimeoutMs: 15000,
  /** After a press, how long the form waits for a token that is still on its way (most people never wait at all). */
  tokenWaitMs: 8000,
  /** Cloudflare's own ceiling on a token's length; anything longer is refused without asking. */
  maxTokenLength: 2048,
  /** The form field the token travels in. */
  field: "cf-turnstile-response",
} as const;

/** Which form a token was earned on. Cloudflare returns it, and the server checks it matches the form it reached. */
export type BotCheckAction = "sign-in" | "give" | "charity-request" | "fresh-link";

/**
 * What happens when Cloudflare itself can't be reached from our server (a timeout, a network error, an outage).
 * A missing or refused token is always refused; this is only for Cloudflare being down.
 *  - sign-in and fresh link: closed. They send an email to an address, and their whole point is to stop a bot
 *    sending those; a person can wait a minute and try again.
 *  - give: open. A real donor is never turned away because Cloudflare is down. The gift still meets the existing
 *    rate limits, the quiet form checks and the payment provider's own card checks, and nothing is charged before the
 *    provider's page. Logged each time.
 *  - charity request: open. It sends no email when asked (the requester is emailed only if the charity joins, much
 *    later), and it keeps its hidden field and rate limits. Logged each time.
 */
export const BOT_CHECK_FAILS_OPEN: Record<BotCheckAction, boolean> = {
  "sign-in": false,
  "fresh-link": false,
  give: true,
  "charity-request": true,
};
