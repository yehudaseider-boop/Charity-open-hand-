import { legalConfig } from "@/config/legal";

/**
 * Every message the bot check says, in one place (23/11/2026), so the same thing reads the same on every form.
 * Each says what happened, what was kept, and what to do now. Dependency-free: the browser and the server read it.
 */

/** What the press would have done, for "nothing was sent" or "nothing was charged". */
export type BotCheckKind = "sign-in" | "give" | "charity-request" | "fresh-link";

const contact = () => (legalConfig.supportEmail ? ` If it keeps happening, email ${legalConfig.supportEmail}.` : "");

/** What did not happen, by form. Giving always says nothing was charged. */
const nothing: Record<BotCheckKind, string> = {
  "sign-in": "No email was sent.",
  "fresh-link": "Nothing was sent.",
  "charity-request": "Nothing was sent.",
  give: "Your payment wasn't started, so nothing was charged.",
};
/** What was kept. The fresh-link button has nothing to type. */
const kept = (kind: BotCheckKind) => (kind === "fresh-link" ? "" : " What you typed is still here.");

/**
 * The server: no token, or Cloudflare said no. Usually an expired check; pressing again gets a fresh one. Without the
 * contact line where the form shows its own (the give form's "If it keeps happening").
 */
export function botCheckRefusedMessage(kind: BotCheckKind, button: string, opts: { contact?: boolean } = {}): string {
  return `We couldn't check this was you. ${nothing[kind]}${kept(kind)} Please press ${button} again.${opts.contact === false ? "" : contact()}`;
}

/** The server couldn't reach Cloudflare, on a form that waits rather than sends unchecked (sign-in, fresh link). */
export function botCheckUnreachableMessage(): string {
  return `We couldn't check this was you just now. Nothing was sent. Please try again in a minute.${contact()}`;
}

/** The browser: Cloudflare's check didn't load (blocked, offline, or too slow). */
export function botCheckLoadFailedMessage(kind: BotCheckKind, offline: boolean): string {
  const why = offline
    ? "You're offline, so the security check couldn't load."
    : "The security check couldn't load. A weak connection or an ad blocker can stop it.";
  const now = offline ? "Check your connection, then press Try again." : "Press Try again, or turn off the ad blocker for this page.";
  return `${why} ${nothing[kind]}${kept(kind)} ${now}`;
}

/** The browser: Cloudflare wants a person to tick its box (most people never see this). */
export function botCheckInteractiveMessage(button: string): string {
  return `Please tick the box below so we know you're a person, then press ${button}.`;
}

/** The browser: pressed while the check is still finishing. */
export const BOT_CHECK_WAITING = "Checking this is you, one moment…";
