import { describe, expect, it } from "vitest";
import { platformConfig } from "@/config/platform";
import { FeeError, cardChargeToCover, priceDonation, providerCharge } from "@/lib/fees";

const mins = {
  minDonationCents: platformConfig.minDonationCents,
  minContributionCents: platformConfig.minContributionCents,
  maxDonationCents: platformConfig.maxDonationCents,
  maxContributionCents: platformConfig.maxContributionCents,
};

function code(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    return e instanceof FeeError ? e.code : "other";
  }
  return null;
}

describe("priceDonation", () => {
  it("charges exactly the donation when there is no contribution (no fees)", () => {
    expect(priceDonation(18_000, 0, mins)).toEqual({ amountCents: 18_000, contributionCents: 0, cardChargeCents: 0, totalCents: 18_000 });
  });

  it("adds the contribution as a separate line", () => {
    expect(priceDonation(3_000, 1_000, mins)).toEqual({ amountCents: 3_000, contributionCents: 1_000, cardChargeCents: 0, totalCents: 4_000 });
    expect(priceDonation(12_345, 2_501, mins).totalCents).toBe(14_846);
  });

  it("enforces the R30 minimum donation and the R10 minimum contribution", () => {
    expect(platformConfig.minDonationCents).toBe(3_000);
    expect(platformConfig.minContributionCents).toBe(1_000);
    expect(code(() => priceDonation(2_999, 0, mins))).toBe("below_minimum");
    expect(code(() => priceDonation(3_000, 999, mins))).toBe("contribution_below_minimum");
    expect(code(() => priceDonation(3_000, 1, mins))).toBe("contribution_below_minimum");
    expect(code(() => priceDonation(3_000, 1_000, mins))).toBeNull();
  });

  it("refuses a gift above R1 000 000 (a typo, not a gift), and takes exactly R1 000 000", () => {
    expect(platformConfig.maxDonationCents).toBe(100_000_000);
    expect(code(() => priceDonation(100_000_001, 0, mins))).toBe("above_maximum");
    expect(code(() => priceDonation(100_000_000, 0, mins))).toBeNull();
    // Callers without a ceiling (older tests) keep working.
    expect(code(() => priceDonation(100_000_001, 0, { minDonationCents: 3_000, minContributionCents: 1_000 }))).toBeNull();
  });

  it("caps the contribution to Givezy at R5 000 a gift (Yehuda, 22/11/2026), with its own code", () => {
    expect(platformConfig.maxContributionCents).toBe(500_000);
    expect(code(() => priceDonation(3_000, 500_000, mins))).toBeNull();
    expect(code(() => priceDonation(3_000, 500_001, mins))).toBe("contribution_above_maximum");
    // A typo in the contribution (R50 000 instead of R50) is the contribution's problem, never the gift's.
    expect(code(() => priceDonation(3_000, 5_000_000, mins))).toBe("contribution_above_maximum");
    expect(code(() => priceDonation(3_000, 100_000_001, mins))).toBe("contribution_above_maximum");
    // The gift's own maximum is not the contribution's: a R1 000 000 gift still takes a R5 000 contribution.
    expect(code(() => priceDonation(100_000_000, 500_000, mins))).toBeNull();
  });

  it("refuses broken amounts", () => {
    for (const [a, c] of [[0, 0], [-100, 0], [30.5, 0], [Number.NaN, 0], [3_000, -1], [3_000, 0.5]]) {
      expect(code(() => priceDonation(a, c, mins))).toBe("invalid_amount");
    }
    // Past the safe-integer range the sum itself is unsafe (no ceiling given here).
    expect(code(() => priceDonation(Number.MAX_SAFE_INTEGER, 1_000, { minDonationCents: 3_000, minContributionCents: 1_000 }))).toBe("invalid_amount");
  });
});

/**
 * Documents what providerCharge does today (23/11/2026, review item 7, unconfirmed): it rounds the provider's charge UP to
 * the cent on the whole payment, so a cover is never a cent short. Test-only numbers (not a real rate); nothing changed.
 */
describe("providerCharge rounding, as it is today", () => {
  const rates = { percentPpm: 100_000, fixedCents: 0, vatOnTopPpm: 0 };
  it("rounds up to the next cent, and an exact cent stays", () => {
    expect(providerCharge(10, rates)).toBe(1);
    expect(providerCharge(11, rates)).toBe(2);
    expect(providerCharge(15, rates)).toBe(2);
  });
  it("adds the fixed part and then VAT on top before rounding up", () => {
    expect(providerCharge(1_000, { percentPpm: 100_000, fixedCents: 100, vatOnTopPpm: 150_000 })).toBe(230);
  });
  it("a cover is never a cent short of the charge on the payment it makes up", () => {
    for (const base of [3_000, 3_001, 12_345, 99_999]) {
      const cover = cardChargeToCover(base, rates);
      expect(cover).toBeGreaterThanOrEqual(providerCharge(base + cover, rates));
    }
  });
});
