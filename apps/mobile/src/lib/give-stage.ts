/**
 * What the Give button says and shows while a gift is going through (12/11/2026). It follows the real stage only:
 * nothing here is a timer pretending progress. No imports on purpose: the website's tests run this file too.
 *
 *   securing  our server is creating the payment (or, with a saved card, charging it)
 *   opening   the payment is made and the secure payment page is being opened
 *   checking  asking the payment provider whether it went through
 */
export type GiveStage = false | "securing" | "opening" | "checking";

/** The words on the button for a stage. A saved-card gift has no payment page, so it never reaches "opening". */
export function stageLabel(stage: GiveStage, payWithSaved: boolean): string {
  if (stage === "securing") return payWithSaved ? "Charging your card…" : "Securing your gift…";
  if (stage === "opening") return "Opening the payment page…";
  if (stage === "checking") return "Checking your payment…";
  return "Giving…";
}

/**
 * The success moment (tick, haptic, burst) plays only for a gift the payment provider has confirmed as paid. A gift
 * still being confirmed, in review, declined, refunded or unknown never gets it.
 */
export function celebrates(outcome: string): boolean {
  return outcome === "paid";
}

/** A stage's words stay up at least this long, so quick stages don't flicker past unread. */
export const LABEL_MIN_MS = 600;

/** How long the tick shows on the button before the thank-you opens. */
export const TICK_MS = 700;

/** How much longer the words on screen should stay before the next stage's words replace them. */
export function labelWait(shownAt: number, now: number, minMs: number = LABEL_MIN_MS): number {
  return Math.max(0, minMs - (now - shownAt));
}
