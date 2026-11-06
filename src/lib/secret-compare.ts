import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

/**
 * Do these two secrets match? Constant-time: both sides are hashed first, so neither the time taken nor an early
 * length check tells a caller how long the secret is or how much of it they guessed. An empty or missing expected
 * secret never matches anything.
 */
export function sameSecret(got: string | null | undefined, want: string | null | undefined): boolean {
  if (!want || typeof got !== "string") return false;
  return timingSafeEqual(digest(got), digest(want));
}

/** Does this Authorization header carry `Bearer <secret>`? Refuses when the secret is not set. */
export function bearerMatches(header: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret) return false;
  return sameSecret(header ?? "", `Bearer ${secret}`);
}
