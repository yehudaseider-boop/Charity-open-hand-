/**
 * What the website's Give button and thank-you page show while a gift goes through (12/11/2026). It follows the real
 * state only. No imports on purpose: the tests and the phone app's copy of the rule run it too.
 *
 * Giving on the website is one form action that ends in a redirect to the secure payment page, so the browser never
 * sees "the payment is made, the page is opening": there is one honest stage (securing) and, when it drags, a slow
 * stage that says so instead of pretending to progress.
 */

/** After this long still waiting, the button says it is taking longer than usual. */
export const SLOW_AFTER_MS = 5000;

export function giveButtonLabel(o: { pending: boolean; slow: boolean; ready: boolean; total: string | null; monthly: boolean }): string {
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
