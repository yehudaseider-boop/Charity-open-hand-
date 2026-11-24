import { describe, expect, it } from "vitest";
import { platformConfig } from "@/config/platform";
import { buttonTextFit, CHOOSE_AN_AMOUNT, footerAmountLine, giftAmountError, giftTotalWords, givableTotal, loadingLine, STILL_CONNECTING, TYPE_AN_AMOUNT, waitingGiftLine } from "../apps/mobile/src/lib/give-checks";
import { afterPaymentMade, leavePrompt, type LeaveState } from "../apps/mobile/src/lib/give-leave";
import { nextFirstOfMonth, recurring, sampleContributionMaxCents } from "../apps/mobile/src/data/giving";
import { nextChargeText } from "../apps/mobile/src/lib/live-giving";
import { fieldErrorsForTheSwitch, forTheSwitch } from "../apps/mobile/src/lib/charity-request";
import { parseRandToCents } from "@/lib/money";

// The give screen's "try to break it" findings of 22/11/2026, as pure rules.
const MIN = 3_000;
const MAX = 100_000_000;
const amountErr = (text: string) => giftAmountError(text, parseRandToCents(text), MIN, MAX);

describe("the gift amount", () => {
  it("can be given only from the minimum to the maximum", () => {
    expect(amountErr("180")).toBeNull();
    expect(amountErr("30")).toBeNull();
    expect(amountErr("29.99")).toBe("The minimum donation is R30");
    expect(amountErr("0")).toBe("The minimum donation is R30");
    expect(amountErr("1000001")).toMatch(/^The largest donation in the app is R1\u00a0000\u00a0000\./);
    expect(amountErr("abc")).toMatch(/^Enter an amount in Rand/);
  });
  it("with nothing chosen, points at the amount buttons, not a box the donor can't see (24/11/2026)", () => {
    expect(amountErr("")).toBe(CHOOSE_AN_AMOUNT);
    expect(amountErr("   ")).toBe(CHOOSE_AN_AMOUNT);
    expect(giftAmountError("", null, 0, null)).toBe("Choose an amount, or tap Other amount to type your own");
  });
  it("with the own-amount box open and empty, asks for an amount in Rand, not to tap Other amount", () => {
    expect(giftAmountError("", null, MIN, MAX, true)).toBe("Type an amount in Rand");
    expect(giftAmountError("  ", null, MIN, MAX, true)).toBe(TYPE_AN_AMOUNT);
    expect(giftAmountError("0", 0, MIN, MAX, true)).toBe("The minimum donation is R30");
  });
  it("with no minimum, 0 still needs an amount", () => {
    expect(giftAmountError("0", 0, 0, null)).toMatch(/^Enter an amount in Rand/);
    expect(giftAmountError("5", 500, 0, null)).toBeNull();
  });
});

describe("the total on the Give button", () => {
  it("is named only when the gift and the contribution can be given", () => {
    expect(givableTotal(18_000, null, 1_000)).toBe(19_000);
    expect(givableTotal(18_000, null, 1_000, 560)).toBe(19_560);
    // Amount 0 with the default contribution read "Hold to give R10".
    expect(givableTotal(0, amountErr("0"), 1_000)).toBeNull();
    // R29.99 read R39.99.
    expect(givableTotal(2_999, amountErr("29.99"), 1_000)).toBeNull();
    // An amount over the maximum read its sum.
    expect(givableTotal(100_000_100, amountErr("1000001"), 1_000)).toBeNull();
    // A contribution that can't be given (null) is no total either.
    expect(givableTotal(18_000, null, null)).toBeNull();
    expect(givableTotal(null, null, 1_000)).toBeNull();
  });
});

describe("a waiting gift, named", () => {
  it("says the amount with the contribution, the charity, and when it started, in Johannesburg time", () => {
    const g = { charityName: "Demo Charity", sentAt: "2026-11-22T14:39:00Z", summary: { cents: 3_000, contributionCents: 100 } };
    expect(waitingGiftLine(g)).toBe("R31 to Demo Charity, started at 16:39 on 22/11/2026.");
  });
  it("names the total the Give button charged, card charge included (23/11/2026)", () => {
    const summary = { cents: 10_000, contributionCents: 1_000, cardChargeCents: 230 };
    // The same total as the Give button for that gift.
    expect(giftTotalWords(summary)).toBe(`R112.30, including the R2.30 card charge,`);
    expect(givableTotal(10_000, null, 1_000, 230)).toBe(11_230);
    expect(waitingGiftLine({ charityName: "Demo Charity", sentAt: "2026-11-22T14:39:00Z", summary })).toBe("R112.30, including the R2.30 card charge, to Demo Charity, started at 16:39 on 22/11/2026.");
    // A gift saved before the card charge was kept reads as before.
    expect(waitingGiftLine({ charityName: "Demo Charity", sentAt: "2026-11-22T14:39:00Z", summary: { cents: 10_000, contributionCents: 1_000 } })).toBe("R110 to Demo Charity, started at 16:39 on 22/11/2026.");
  });
  it("an unreadable time leaves the time out rather than showing nonsense", () => {
    expect(waitingGiftLine({ charityName: "Demo Charity", sentAt: "not a date", summary: { cents: 18_050, contributionCents: 0 } })).toBe("R180.50 to Demo Charity.");
  });
});

describe("the line under the Give button", () => {
  it("names a short charity, and says 'the charity' for a long name already in the top bar", () => {
    expect(footerAmountLine(18_000, "Demo Charity", 0, "R10")).toBe("R180 to Demo Charity. Contribution to Givezy: R10.");
    expect(footerAmountLine(18_000, "Linksfield Evening Learning Centre Trust", 560, "R10 a month")).toBe("R180 to the charity, plus R5.60 card charge. Contribution to Givezy: R10 a month.");
  });
});

describe("the Give button label on a narrow phone", () => {
  it("keeps its size when it fits, and shrinks a long total to one line", () => {
    expect(buttonTextFit("Hold to give R180", 288, 18)).toBeNull();
    const fit = buttonTextFit("Hold to give R1 034 511.79 every month", 288, 18);
    expect(fit).not.toBeNull();
    expect(fit!.fontSize).toBeLessThan(18);
    expect(fit!.fontSize).toBeGreaterThanOrEqual(12);
    expect(buttonTextFit("Hold to give R1 034 511.79", 0, 18)).toBeNull();
  });
});

describe("words while loading", () => {
  it("says what it's doing, then that it's slow, and offline at once when the device says so", () => {
    expect(loadingLine(0, 6_000, "Getting giving ready…")).toBe("Getting giving ready…");
    expect(loadingLine(5_999, 6_000, "Getting giving ready…")).toBe("Getting giving ready…");
    expect(loadingLine(6_000, 6_000, "Getting giving ready…")).toBe(STILL_CONNECTING);
    expect(loadingLine(0, 4_000)).toBeNull();
    expect(loadingLine(4_000, 4_000)).toBe("Still connecting… this is taking longer than usual.");
    expect(loadingLine(0, 4_000, null, true)).toMatch(/^You're offline/);
  });
});

describe("monthly next dates", () => {
  it("the sample's next date is the 1st of next month in Johannesburg, never in the past", () => {
    expect(nextFirstOfMonth(new Date("2026-11-22T10:00:00Z"))).toEqual(new Date(2026, 11, 1));
    // 23:30 UTC on 31 December is already 1 January in Johannesburg.
    expect(nextFirstOfMonth(new Date("2026-12-31T23:30:00Z"))).toEqual(new Date(2027, 1, 1));
    const active = recurring.find((r) => r.status === "active");
    expect(active?.nextDate && active.nextDate.getTime() > Date.now() - 24 * 3_600_000).toBe(true);
  });
  it("a next date that has passed reads as due, never 'Next on' a past day", () => {
    const today = new Date(2026, 10, 22);
    expect(nextChargeText(new Date(2026, 11, 1), today)).toBe("Next on 01/12/2026");
    expect(nextChargeText(new Date(2026, 10, 22), today)).toBe("Next on 22/11/2026");
    expect(nextChargeText(new Date(2026, 10, 1), today)).toBe("Due now: being collected");
    expect(nextChargeText(new Date(2026, 10, 1), today, true)).toBe("due now: being collected");
    expect(nextChargeText(new Date(2026, 11, 1), today, true)).toBe("next on 01/12/2026");
  });
  it("the preview's contribution cap is the platform's", () => {
    expect(sampleContributionMaxCents).toBe(platformConfig.maxContributionCents);
  });
});

describe("request a charity: the switch, not a box", () => {
  it("says switch off, not untick the box", () => {
    expect(forTheSwitch("Enter your email address, or untick the box.")).toBe('Enter your email address, or switch off "Email me when it joins".');
    expect(fieldErrorsForTheSwitch({ email: "Enter your email address, or untick the box.", name: "Enter the charity's name." })).toEqual({
      email: 'Enter your email address, or switch off "Email me when it joins".',
      name: "Enter the charity's name.",
    });
  });
});

describe("leaving the give screen (23/11/2026)", () => {
  const base: LeaveState = { done: false, typed: false, busy: false, held: false, waiting: false };

  it("asks first while a payment is being started, before any other question", () => {
    for (const busy of ["securing", "opening"] as const) {
      expect(leavePrompt({ ...base, busy, typed: true })).toMatchObject({ title: "Your payment is being started", leave: "Leave", stay: "Stay" });
      expect(leavePrompt({ ...base, busy, held: true })?.title).toBe("Your payment is being started");
    }
  });

  it("keeps the other questions, and lets an untouched or finished screen close", () => {
    expect(leavePrompt({ ...base, waiting: true })?.title).toBe("Your gift may still be going through");
    expect(leavePrompt({ ...base, busy: "checking" })?.title).toBe("We're still checking your payment");
    expect(leavePrompt({ ...base, typed: true })?.title).toBe("Leave and lose what you typed?");
    expect(leavePrompt(base)).toBeNull();
    expect(leavePrompt({ ...base, done: true, busy: "securing", typed: true })).toBeNull();
  });

  it("never opens the payment page, or follows up a charge, once the donor has left", () => {
    expect(afterPaymentMade(true, false)).toBe("stop");
    expect(afterPaymentMade(true, true)).toBe("stop");
    expect(afterPaymentMade(false, false)).toBe("open-page");
    expect(afterPaymentMade(false, true)).toBe("check");
  });

  it("uses no exclamation marks", () => {
    for (const s of [{ ...base, busy: "securing" as const }, { ...base, waiting: true }, { ...base, busy: "checking" as const }, { ...base, typed: true }]) {
      const p = leavePrompt(s)!;
      expect(`${p.title} ${p.body} ${p.leave} ${p.stay}`).not.toContain("!");
    }
  });
});
