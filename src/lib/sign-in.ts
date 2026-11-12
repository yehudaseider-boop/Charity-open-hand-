import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hashedKey, ipKeys } from "@/lib/rate-limit";

/**
 * Sign-in on the website: the plain messages (the same on the Sign in page and on the apply page), the limit keys,
 * and the short-lived proof that "We sent a link to …" names an address our own server just sent to.
 */

/** What went wrong, in plain words. One wording everywhere a sign-in email is asked for. */
export const signInMessages: Record<string, string> = {
  email: "Please enter a valid email address.",
  send: "We couldn't send the link. Please try again in a minute.",
  link: "That sign-in link didn't work. It only opens in the browser you asked for it from. Ask for a new one and type the code from the email instead.",
  code: "That code didn't work. Check it, or ask for a new email and use the newest code.",
  busy: "We've sent several links to this address in the last hour. Please use the latest one, or try again later.",
  tries: "That's too many wrong codes for now. Please wait an hour and try again, or ask for a new email and use the newest code.",
};

export const signInMessage = (code: unknown): string | undefined => (typeof code === "string" && Object.hasOwn(signInMessages, code) ? signInMessages[code] : undefined);

/** The same shape check everywhere: something@something.something, no spaces. */
export const looksLikeEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/**
 * Limit keys for one person on one connection: the email (as its one-way stand-in) together with the internet address,
 * the email alone, and the address alone. Empty when a part is missing (no address header, no key on the live site):
 * that limit is then skipped, and the others still apply.
 */
export function signInKeys(email: string, ip: string): { pair: string[]; email: string[]; address: string[] } {
  const e = hashedKey("email", email);
  const address = ipKeys(ip);
  return { pair: e && address[0] ? [`${e}|${address[0]}`] : [], email: e ? [e] : [], address };
}

// Without ENCRYPTION_KEY: a secret for this server process only on a developer's machine; on the live or test site
// none, so the address is simply not shown (never an unkeyed value anyone could make).
const devSecret = randomBytes(32);
function secret(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (raw) return Buffer.from(raw, "base64");
  return process.env.NODE_ENV === "production" ? null : devSecret;
}

/** How long "We sent a link to …" may show the address after we sent it: as long as the emailed code works. */
export const SENT_PROOF_MINUTES = 60;

const sign = (email: string, until: number, key: Buffer) => createHmac("sha256", key).update(`login-sent|${email.trim().toLowerCase()}|${until}`).digest("base64url").slice(0, 32);

/** A proof that our server sent a sign-in email to this address just now: "<until>.<signature>". Null without a key. */
export function sentProof(email: string, now = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  const until = Math.floor(now / 1000) + SENT_PROOF_MINUTES * 60;
  return `${until}.${sign(email, until, key)}`;
}

/** Whether the "Check your email" page may name this address: only with a matching proof that has not run out. */
export function sentProofMatches(email: string, proof: unknown, now = Date.now()): boolean {
  const key = secret();
  if (!key || !email || typeof proof !== "string") return false;
  const m = /^(\d{10})\.([A-Za-z0-9_-]{32})$/.exec(proof);
  if (!m) return false;
  const until = Number(m[1]);
  if (until * 1000 < now) return false;
  const want = Buffer.from(sign(email, until, key));
  const got = Buffer.from(m[2]);
  return want.length === got.length && timingSafeEqual(want, got);
}

/**
 * The "Check your email" page for this address, with its proof (no address at all when there is no key). A new proof
 * is made only when an email was really sent; anywhere else pass `keepProof`, the one the page already had, and the
 * address is kept only if that still matches (so the code form can't be used to get a proof for any address).
 */
export function sentPageUrl(email: string, next: string, extra: Record<string, string> = {}, keepProof?: unknown): string {
  const proof = keepProof === undefined ? sentProof(email) : sentProofMatches(email, keepProof) ? String(keepProof) : null;
  const q = new URLSearchParams({ sent: "1", ...extra, next, ...(proof ? { email, s: proof } : {}) });
  return `/login?${q.toString()}`;
}
