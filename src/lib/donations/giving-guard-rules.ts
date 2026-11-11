/**
 * Card-testing protection: the parts that need no database (wording and the website form's quiet bot checks).
 * The limits themselves live in platformConfig.givingGuard; the counting is in giving-guard.ts.
 */

/** Why a gift start was refused. Counted (never with an email or address) for Admin, Payments. */
export type GuardReason = "email" | "address" | "email-day" | "address-day" | "declines" | "bot";

export const GUARD_REASON_LABEL: Record<GuardReason, string> = {
  email: "Too many tries from one email",
  address: "Too many tries from one internet address",
  "email-day": "Daily limit for one email",
  "address-day": "Daily limit for one internet address",
  declines: "Waiting after several declined cards",
  bot: "Looked like a bot (form filled in too fast, or the hidden field filled)",
};

/** "in 10 minutes", "in an hour", "tomorrow": how long to wait, in plain words. */
export function waitWords(minutes: number): string {
  if (minutes >= 1_440) return "tomorrow";
  if (minutes === 60) return "in an hour";
  if (minutes > 60 && minutes % 60 === 0) return `in ${minutes / 60} hours`;
  return `in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/** What a donor reads when a limit stops a gift. Says plainly that nothing was charged. */
export function tooManyTriesMessage(minutes: number, supportEmail?: string | null): string {
  const contact = supportEmail ? `, or contact us at ${supportEmail}` : ", or contact us";
  const when = minutes >= 1_440 ? "today" : "in a short time";
  return `Too many tries ${when}. Nothing was charged. Please try again ${waitWords(minutes)}${contact}.`;
}

/** What a person reads when the quiet bot checks stop a form. A real person simply presses Give again. */
export const PRESS_AGAIN_MESSAGE = "Please check your details and press Give again. Nothing was charged.";

/**
 * The website give form's quiet checks: a hidden field only bots fill in, and how long the form was open
 * (measured in the donor's browser). A missing time (an old page from before this change) is let through:
 * the attempt limits still apply.
 */
export function botCheck(args: { honeypot: unknown; openMs: unknown; minFillSeconds: number }): "ok" | "honeypot" | "too-fast" {
  if (typeof args.honeypot === "string" ? args.honeypot.trim() !== "" : args.honeypot != null && args.honeypot !== "") return "honeypot";
  if (typeof args.openMs !== "string" || !/^\d{1,12}$/.test(args.openMs)) return "ok";
  return Number(args.openMs) < args.minFillSeconds * 1_000 ? "too-fast" : "ok";
}
