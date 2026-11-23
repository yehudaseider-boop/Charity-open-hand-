import type { GiveStage } from "./give-stage";

/**
 * Leaving the give screen (review 23/11/2026): what the back gesture asks first, and what a gift that was being
 * started does once the donor has left. No imports beyond a type, so the website's tests run this file too.
 */

export type LeaveState = {
  /** The thank-you is showing: nothing to lose. */
  done: boolean;
  /** Something typed would be lost. */
  typed: boolean;
  busy: GiveStage;
  /** A saved-card charge, or a payment, we haven't heard the end of. */
  held: boolean;
  waiting: boolean;
};

export type LeavePrompt = { title: string; body: string; leave: string; stay: string };

/** The question the back gesture asks before leaving, or null when the screen can simply close. */
export function leavePrompt(s: LeaveState): LeavePrompt | null {
  if (s.done) return null;
  // Our server is making the payment, or the payment page is about to open: leaving stops the page opening.
  if (s.busy === "securing" || s.busy === "opening") {
    return {
      title: "Your payment is being started",
      body: "If you leave now, the payment page won't open. If the gift was already started, it shows on Progress so you can check it.",
      leave: "Leave",
      stay: "Stay",
    };
  }
  if (s.held || s.waiting) return { title: "Your gift may still be going through", body: "If you leave, we'll keep checking.", leave: "Leave", stay: "Stay" };
  if (s.busy === "checking") return { title: "We're still checking your payment", body: "Leaving now may lose the result. It takes a few seconds.", leave: "Leave anyway", stay: "Wait" };
  if (s.typed) return { title: "Leave and lose what you typed?", body: "", leave: "Leave", stay: "Keep editing" };
  return null;
}

/**
 * What happens once our server has made the payment. `left`: the donor left the give screen while it was being
 * made. The waiting gift is kept on the phone either way (so Progress asks about it), but a payment page never
 * opens over another screen, and a saved-card charge isn't followed up on a screen nobody is looking at.
 */
export function afterPaymentMade(left: boolean, charged: boolean): "stop" | "open-page" | "check" {
  if (left) return "stop";
  return charged ? "check" : "open-page";
}
