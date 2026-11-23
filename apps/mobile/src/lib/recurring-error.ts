/**
 * Why a monthly donation couldn't be changed (review 23/11/2026). The database's own reason is passed through for the
 * two cases it words for the donor (a payment under dispute is being looked into; no card left to charge). Anything else
 * is the same plain line as before. No imports: the website's tests run this file too.
 */
export const RECURRING_REASON = /looked into|no card to charge/;

/** The reason the database gave, when it is one of the passed-through ones; otherwise a plain "try again". */
export function recurringFailureMessage(databaseMessage: string): string {
  return RECURRING_REASON.test(databaseMessage) ? databaseMessage : "We couldn't change that. Please try again.";
}

/** The line shown on the Giving tab: what didn't happen, then why (the database's reason, or check the connection). */
export function recurringChangeError(verb: "pause" | "resume" | "cancel", reason: string): string {
  const passedThrough = RECURRING_REASON.test(reason);
  return `We couldn't ${verb} it, so your monthly donation is unchanged. ${passedThrough ? reason : "Check your connection and try again."}`;
}
