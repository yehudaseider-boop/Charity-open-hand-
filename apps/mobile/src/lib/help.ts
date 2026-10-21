/**
 * How to reach a person at Givezy, from anywhere in the app (Yehuda's quality rules, 18/10/2026: every
 * payment problem offers a way to reach a person). EXPO_PUBLIC_SUPPORT_EMAIL is set once Givezy has
 * its support address (go-live checklist); until then people reply to any email we've sent them.
 * No imports on purpose: the website's tests run this file too.
 */
export const SUPPORT_EMAIL = (process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "").trim() || null;

/** One line under a problem: how to reach someone. */
export function helpLine(email: string | null = SUPPORT_EMAIL): string {
  return email ? `Questions? Email us at ${email} and a person will help.` : "Questions? Reply to any email we've sent you and a person will help.";
}

/** A mail link to the support address, or null until there is one. */
export function helpMailto(email: string | null = SUPPORT_EMAIL, subject = "Help with Givezy"): string | null {
  return email ? `mailto:${email}?subject=${encodeURIComponent(subject)}` : null;
}
