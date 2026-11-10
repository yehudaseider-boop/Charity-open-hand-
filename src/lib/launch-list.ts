/**
 * "Notify me at launch" on the landing page (Yehuda, 10/11/2026): a giver leaves an email to hear once, when Givezy
 * launches. New personal data (POPIA), so it stays switched off (`appLinks.launchListOpen`) until the table
 * (migration 20261110000012_launch_list.sql) is on the database with Yehuda's yes. Nothing is emailed from it until
 * launch, again with his yes. Pure and dependency-free.
 */

/** DRAFT WORDING for Yosef. The version is stored with every email, so we can always say what was agreed. */
export const LAUNCH_LIST_CONSENT = {
  version: "launch-list-2026-11-10",
  text: "We'll email you once, when Givezy launches, and you can unsubscribe in one tap. We keep only your email address.",
} as const;

export const LAUNCH_LIST_MESSAGES = {
  closed: "The list isn't open yet. Nothing was saved. Please come back soon.",
  empty: "Enter your email address.",
  invalid: "That doesn't look like an email address. Check it and try again.",
  tooMany: "Too many tries from here. Nothing was saved. Please try again in an hour.",
  failed: "We couldn't add you just now. Nothing was saved. Please try again.",
  done: "You're on the list. We'll email you once, when Givezy launches.",
} as const;

/** How many tries one address may make in an hour. */
export const LAUNCH_LIST_LIMIT = { tries: 5, minutes: 60 } as const;

export type LaunchListCheck = { ok: true; email: string } | { ok: false; message: string };

/** Reads what was typed: trimmed, lower case, a plain address with no spaces, at most 254 characters. */
export function checkLaunchListEmail(raw: unknown): LaunchListCheck {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!email) return { ok: false, message: LAUNCH_LIST_MESSAGES.empty };
  if (email.length > 254 || !/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i.test(email)) return { ok: false, message: LAUNCH_LIST_MESSAGES.invalid };
  return { ok: true, email };
}

/** A filled-in hidden field means a bot: say "done" and save nothing. */
export function isBot(honeypot: unknown): boolean {
  return typeof honeypot === "string" && honeypot.trim().length > 0;
}

/** The unsubscribe token in a stop link: a uuid, nothing else. */
export function isStopToken(raw: unknown): raw is string {
  return typeof raw === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
}

/** The landing page's two doors. A shared link opens one by its #give or #charity hash. */
export type Door = "give" | "charity";
export function doorFromHash(hash: string | null | undefined): Door | null {
  const h = (hash ?? "").replace(/^#/, "").toLowerCase();
  return h === "give" || h === "charity" ? h : null;
}
