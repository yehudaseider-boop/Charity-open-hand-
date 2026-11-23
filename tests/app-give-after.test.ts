import { describe, expect, it } from "vitest";
import { afterCheckAgain, afterReply, messageOutcome, type Asked } from "../apps/mobile/src/lib/give-after";
import { afterPaymentMessage, afterPaymentTone } from "../apps/mobile/src/lib/pay-api";
import { recurringChangeError, recurringFailureMessage } from "../apps/mobile/src/lib/recurring-error";

describe("what the give screen does with the server's answer", () => {
  const rows: [string, Asked, boolean, "returned" | "closed", { finished: boolean; attempt: string; waiting: boolean; drop: boolean }][] = [
    ["paid", "paid", false, "returned", { finished: true, attempt: "none", waiting: false, drop: false }],
    ["pending, back from page", "pending", false, "returned", { finished: true, attempt: "none", waiting: true, drop: false }],
    ["pending, page closed", "pending", false, "closed", { finished: false, attempt: "none", waiting: true, drop: false }],
    ["no answer, back from page", "unknown", false, "returned", { finished: false, attempt: "none", waiting: true, drop: false }],
    ["failed", "failed", false, "returned", { finished: false, attempt: "none", waiting: false, drop: true }],
    ["not found", "not_found", false, "closed", { finished: false, attempt: "none", waiting: false, drop: true }],
    ["review", "review", false, "returned", { finished: false, attempt: "none", waiting: true, drop: false }],
    ["saved card paid", "paid", true, "returned", { finished: true, attempt: "clear", waiting: false, drop: false }],
    ["saved card pending", "pending", true, "returned", { finished: false, attempt: "hold", waiting: true, drop: false }],
    ["saved card no answer", "unknown", true, "returned", { finished: false, attempt: "hold", waiting: true, drop: false }],
    ["saved card failed", "failed", true, "returned", { finished: false, attempt: "clear", waiting: false, drop: true }],
    ["saved card reversed", "reversed", true, "returned", { finished: false, attempt: "clear", waiting: false, drop: true }],
    ["saved card not found", "not_found", true, "returned", { finished: false, attempt: "hold", waiting: false, drop: true }],
  ];
  it.each(rows)("%s", (_n, outcome, charged, shown, want) => {
    expect(afterReply(outcome, charged, shown)).toMatchObject(want);
  });

  it("keeps 'no answer' as its own words", () => {
    expect(afterReply("unknown", false, "returned").say).toBe("unknown");
    expect(messageOutcome("something odd")).toBe("unknown");
    expect(afterCheckAgain("unknown", false).say).toBe("unknown");
  });

  it("check again: settles, clears the saved-card attempt, or stays waiting", () => {
    expect(afterCheckAgain("paid", true)).toMatchObject({ settled: true, clearAttempt: true, paid: true });
    expect(afterCheckAgain("not_found", true)).toMatchObject({ settled: true, clearAttempt: true, paid: false });
    expect(afterCheckAgain("failed", false)).toMatchObject({ settled: true, clearAttempt: false });
    expect(afterCheckAgain("pending", true)).toMatchObject({ settled: false, clearAttempt: false });
    expect(afterCheckAgain("unknown", true)).toMatchObject({ settled: false, clearAttempt: false });
  });
});

describe("no answer from our server", () => {
  it("says it plainly, with no check time and no 'still confirming'", () => {
    const m = afterPaymentMessage("unknown", false, new Date());
    expect(m).toBe("We couldn't reach Givezy to check. Nothing has changed. Check again when you're connected.");
    expect(m).not.toMatch(/Last checked|confirming|waiting to hear/);
    expect(afterPaymentTone("unknown")).toBe("wait");
  });
});

describe("why a monthly donation couldn't change", () => {
  it("shows the database's own reason when it is a passed-through one", () => {
    const why = "This monthly donation is held while a disputed payment is looked into.";
    expect(recurringChangeError("pause", why)).toContain(why);
    expect(recurringChangeError("cancel", "There is no card to charge.")).toContain("no card to charge");
    expect(recurringFailureMessage(why)).toBe(why);
  });
  it("keeps the connection line for anything else", () => {
    expect(recurringChangeError("resume", "We couldn't change that. Please try again.")).toBe("We couldn't resume it, so your monthly donation is unchanged. Check your connection and try again.");
  });
});
