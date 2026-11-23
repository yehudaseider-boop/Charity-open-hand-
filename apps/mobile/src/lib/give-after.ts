import { settles } from "./pending-gift";

/**
 * What the give screen does once our server has answered "did the payment go through?" (review 23/11/2026).
 * Lifted out of the screen so the table of answers can be tested. "unknown" is no answer at all (offline, a
 * timeout, "busy", an outage): it is never read as "the provider is still confirming".
 */

export type Asked = "paid" | "failed" | "pending" | "review" | "not_found" | "reversed" | "expired" | "unknown";
export type NotPaid = Exclude<Asked, "paid">;

/** What the donor is told when the gift isn't confirmed as paid. Anything unrecognised counts as "unknown". */
export function messageOutcome(outcome: string): NotPaid {
  return outcome === "failed" || outcome === "not_found" || outcome === "reversed" || outcome === "review" || outcome === "expired" || outcome === "pending" ? outcome : "unknown";
}

export type AfterReply = {
  /** The thank-you shows now. */
  finished: boolean;
  /** A saved-card attempt: settled (forget its id), or still unsettled (hold the gift as sent). */
  attempt: "clear" | "hold" | "none";
  /** Still waiting on an answer: the gift stays kept on the phone and "Check again" shows. */
  waiting: boolean;
  /** Declined or not found: nothing to wait for, so the kept gift is dropped. */
  drop: boolean;
  /** Which words to show when not finished. */
  say: NotPaid;
};

/**
 * `shown`: whether the donor came back from the payment page ("returned") or closed it ("closed").
 * Back from the page with our server saying the provider is still catching up counts as given; no answer at all
 * never does (the donor may have come back from a declined payment); a saved-card charge counts only when paid.
 */
export function afterReply(outcome: Asked, charged: boolean, shown: "returned" | "closed"): AfterReply {
  const finished = outcome === "paid" || (outcome === "pending" && shown === "returned" && !charged);
  const attempt = !charged ? "none" : outcome === "paid" || outcome === "failed" || outcome === "reversed" ? "clear" : "hold";
  const say = outcome === "paid" ? "unknown" : outcome;
  const waiting = outcome !== "paid" && (say === "pending" || say === "review" || say === "unknown");
  return { finished, attempt, waiting, drop: outcome !== "paid" && !waiting, say };
}

export type AfterCheckAgain = { settled: boolean; clearAttempt: boolean; paid: boolean; say: NotPaid };

/** "Check again" on an unsettled payment. */
export function afterCheckAgain(outcome: Asked, charged: boolean): AfterCheckAgain {
  const settled = settles(outcome);
  return { settled, clearAttempt: settled && charged, paid: outcome === "paid", say: outcome === "paid" ? "unknown" : outcome };
}
