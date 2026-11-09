/**
 * The contribution to Givezy (decided 09/11/2026): R10, R20 and R30 buttons, Other and No thanks, R20 preselected,
 * all from the config. Shared by the website and the phone app.
 */
import { describe, expect, it } from "vitest";
import { platformConfig } from "@/config/platform";
import { CONTRIBUTION_EXPLAINER, NO_CONTRIBUTION_NOTE, contributionCents, contributionLabel, startingChoice } from "@/lib/donations/contribution";
import { checkShownTotal, quoteDonation, quoteFromTyped } from "@/lib/donations/quote";
import { readGiveLink } from "@/lib/donations/give-link";
import { sampleContribution } from "../apps/mobile/src/data/giving";

const min = platformConfig.minContributionCents;

describe("the config", () => {
  it("has the decided presets and default, in whole Rand cents, each at least the minimum", () => {
    expect(platformConfig.contributionPresetsCents).toEqual([1_000, 2_000, 3_000]);
    expect(platformConfig.contributionDefaultCents).toBe(2_000);
    for (const c of platformConfig.contributionPresetsCents) {
      expect(Number.isSafeInteger(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(min);
    }
    expect(platformConfig.contributionPresetsCents).toContain(platformConfig.contributionDefaultCents);
  });
  it("the app's preview (no server) shows the same buttons as the config", () => {
    expect(sampleContribution).toEqual({ presetsCents: [...platformConfig.contributionPresetsCents], defaultCents: platformConfig.contributionDefaultCents, minCents: platformConfig.minContributionCents });
  });
});

describe("startingChoice", () => {
  it("preselects the default when it is one of the presets", () => {
    expect(startingChoice(platformConfig.contributionPresetsCents, platformConfig.contributionDefaultCents)).toBe(2_000);
  });
  it("starts on No thanks rather than make up an amount", () => {
    expect(startingChoice([1_000, 3_000], 2_000)).toBe("none");
    expect(startingChoice([], 2_000)).toBe("none");
    expect(startingChoice([1_000], 0)).toBe("none");
  });
});

describe("contributionCents", () => {
  it("is the preset, or R0 for No thanks", () => {
    expect(contributionCents(2_000, "", min)).toEqual({ ok: true, cents: 2_000 });
    expect(contributionCents("none", "45", min)).toEqual({ ok: true, cents: 0 });
  });
  it("takes an amount typed under Other from the minimum, and 0", () => {
    expect(contributionCents("other", "10", min)).toEqual({ ok: true, cents: 1_000 });
    expect(contributionCents("other", "R25.50", min)).toEqual({ ok: true, cents: 2_550 });
    expect(contributionCents("other", "0", min)).toEqual({ ok: true, cents: 0 });
  });
  it("refuses less than the minimum, an empty box and nonsense, in plain words with a way out", () => {
    for (const typed of ["9.99", "5", "", "  ", "abc", "1,250", "-5"]) {
      const r = contributionCents("other", typed, min);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).not.toMatch(/!/);
    }
    expect(contributionCents("other", "5", min)).toEqual({ ok: false, message: "The minimum contribution to Givezy is R10. Choose a bigger amount, or No thanks." });
    expect(contributionCents("other", "", min)).toMatchObject({ ok: false, message: expect.stringContaining("No thanks") });
  });
});

describe("the words", () => {
  it("says a month when the gift is monthly", () => {
    expect(contributionLabel(2_000, false)).toBe("R20");
    expect(contributionLabel(2_000, true)).toBe("R20 a month");
    expect(contributionLabel(0, false)).toBe("R0");
  });
  it("is plain and guilt-free", () => {
    for (const line of [CONTRIBUTION_EXPLAINER, NO_CONTRIBUTION_NOTE]) {
      expect(line).not.toMatch(/!|sure|only|just|please|sad|miss/i);
    }
    expect(CONTRIBUTION_EXPLAINER).toContain("separate from your gift");
  });
});

describe("the live total and the server's check", () => {
  it("adds the chosen contribution as its own figure", () => {
    expect(quoteFromTyped("250", 2_000, "", false)).toMatchObject({ ok: true, quote: { amountCents: 25_000, contributionCents: 2_000, totalCents: 27_000 } });
    expect(quoteFromTyped("250", "none", "", false)).toMatchObject({ ok: true, quote: { contributionCents: 0, totalCents: 25_000 } });
    expect(quoteFromTyped("250", "other", "45", false)).toMatchObject({ ok: true, quote: { contributionCents: 4_500, totalCents: 29_500 } });
  });
  it("still names the amount box first when both are wrong", () => {
    expect(quoteFromTyped("", "other", "5", false)).toMatchObject({ ok: false, field: "amount" });
  });
  it("the server allows R0, refuses under the minimum, and refuses a total the donor did not see", () => {
    expect(quoteDonation(25_000, 0).ok).toBe(true);
    expect(quoteDonation(25_000, 500)).toMatchObject({ ok: false, code: "contribution_below_minimum", message: "The minimum contribution to Givezy is R10." });
    expect(checkShownTotal(25_000, 2_000, false, 27_000).ok).toBe(true);
    // A preselected R20 the page didn't show (an old page that showed R250) is refused, nothing charged.
    expect(checkShownTotal(25_000, 2_000, false, 25_000)).toMatchObject({ ok: false, message: expect.stringContaining("nothing was charged") });
  });
});

describe("give links", () => {
  it("still preset the amount and monthly, and never a contribution", () => {
    const limits = platformConfig;
    const link = readGiveLink({ amount: "250", monthly: "1", contribution: "30", tip: "30" } as Record<string, unknown>, limits);
    expect(link).toEqual({ amountCents: 25_000, monthly: true });
  });
});
