import { timingSafeEqual } from "node:crypto";

/**
 * Apple's (and Google's) app reviewer signs in with a fixed code (Yehuda, 22/11/2026): reviews happen at night in
 * South Africa, so a code emailed to a person who passes it on would fail the review. One reviewer email address, set
 * with its code in two settings on the server; off while either is missing. Switch it off after approval.
 *
 * REVIEW_SIGN_IN_EMAIL  the reviewer's email, given to Apple in the review notes (an empty donor account)
 * REVIEW_SIGN_IN_CODE   the fixed code, at least 8 characters (given to Apple in the review notes)
 *
 * Pure: the route (src/app/api/app/review-sign-in) does the sign-in and the safety checks around it.
 */
export type ReviewSignIn = { email: string; code: string } | null;

export function reviewSignIn(env: Record<string, string | undefined> = process.env): ReviewSignIn {
  const email = (env.REVIEW_SIGN_IN_EMAIL ?? "").trim().toLowerCase();
  const code = (env.REVIEW_SIGN_IN_CODE ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || code.length < 8) return null;
  return { email, code };
}

/** Whether this email and code are the reviewer's. The code is compared in constant time. */
export function isReviewSignIn(setting: ReviewSignIn, email: unknown, code: unknown): boolean {
  if (!setting || typeof email !== "string" || typeof code !== "string") return false;
  if (email.trim().toLowerCase() !== setting.email) return false;
  const a = Buffer.from(code.trim());
  const b = Buffer.from(setting.code);
  return a.length === b.length && timingSafeEqual(a, b);
}
