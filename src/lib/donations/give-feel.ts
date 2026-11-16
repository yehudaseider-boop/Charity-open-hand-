/**
 * What the website's Give button and thank-you page show while a gift goes through (12/11/2026). It follows the real
 * state only. No imports on purpose: the tests and the phone app's copy of the rule run it too.
 *
 * Giving on the website is one form action that hands back the secure payment page's address, which the form then
 * opens (13/11/2026; before, a server redirect left the button waiting for as long as the phone took to open the
 * page). Three honest stages: securing, a slow stage that says so instead of pretending to progress, and opening the
 * payment page, with a link to it in case the phone doesn't open it. If the server hasn't answered after
 * GIVE_GIVE_UP_MS (an answer lost on a weak connection), the form stops waiting and says so, with "Try again", which
 * opens the form afresh with what was typed still filled in: nothing can have been charged, since the card is only
 * ever entered on the payment page. (Pressing Give again instead would only queue behind the lost answer: the
 * browser sends the site's form actions one at a time.)
 */

/** After this long still waiting, the button says it is taking longer than usual. */
export const SLOW_AFTER_MS = 5000;

/**
 * After this long with no answer from our server, the form stops waiting. Longer than the server's own limit for the
 * give step (the payment provider gets 20 seconds, the whole step 30), so a slow but working answer is never cut off.
 */
export const GIVE_GIVE_UP_MS = 40_000;

/** Shown when the form stopped waiting for our server. Nothing was charged: the card is only entered on the payment page. */
export const GIVE_GAVE_UP_MESSAGE =
  "This is taking too long, so we've stopped waiting. Nothing was charged. Check your connection and press Try again. Your name, email and amount stay filled in; the ticks and any ID or tax number need doing again.";

export function giveButtonLabel(o: { pending: boolean; slow: boolean; ready: boolean; total: string | null; monthly: boolean; opening?: boolean; gaveUp?: boolean }): string {
  if (o.opening) return "Opening the payment page…";
  if (o.pending && o.gaveUp) return "Stopped waiting";
  if (o.pending) return o.slow ? "Still working on it…" : "Securing your gift…";
  if (!o.ready) return "Loading…";
  if (!o.total) return "Give";
  return o.monthly ? `Give ${o.total} every month` : `Give ${o.total}`;
}

/** The line under the button while it waits. It always says nothing is charged yet. */
export function giveWaitingLine(slow: boolean): string {
  return slow
    ? "This is taking longer than usual. Nothing is charged until you confirm on the payment page."
    : "Starting your payment. Nothing is charged until you confirm on the payment page.";
}

/**
 * The thank-you page's success moment (tick, drops, confirmation read aloud) is only for a gift the payment provider
 * has confirmed as paid. Still confirming, in review, declined, refunded or not found never gets it.
 */
export function celebratesOutcome(outcome: string): boolean {
  return outcome === "paid";
}
