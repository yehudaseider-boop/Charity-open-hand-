import { describe, expect, it } from "vitest";
import { platformConfig } from "@/config/platform";
import { FeeError, priceDonation } from "@/lib/fees";

const mins = { minDonationCents: platformConfig.minDonationCents, minContributionCents: platformConfig.minContributionCents, maxDonationCents: platformConfig.maxDonationCents };

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
    expect(priceDonation(18_000, 0, mins)).toEqual({ amountCents: 18_000, contributionCents: 0, totalCents: 18_000 });
  });

  it("adds the contribution as a separate line", () => {
    expect(priceDonation(3_000, 1_000, mins)).toEqual({ amountCents: 3_000, contributionCents: 1_000, totalCents: 4_000 });
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
    // A typo in the contribution (R50 000 instead of R50) is caught the same way.
    expect(code(() => priceDonation(3_000, 100_000_001, mins))).toBe("above_maximum");
    expect(code(() => priceDonation(100_000_000, 0, mins))).toBeNull();
    // Callers without a ceiling (older tests) keep working.
    expect(code(() => priceDonation(100_000_001, 0, { minDonationCents: 3_000, minContributionCents: 1_000 }))).toBeNull();
  });

  it("refuses broken amounts", () => {
    for (const [a, c] of [[0, 0], [-100, 0], [30.5, 0], [Number.NaN, 0], [3_000, -1], [3_000, 0.5]]) {
      expect(code(() => priceDonation(a, c, mins))).toBe("invalid_amount");
    }
    // Past the safe-integer range the sum itself is unsafe (no ceiling given here).
    expect(code(() => priceDonation(Number.MAX_SAFE_INTEGER, 1_000, { minDonationCents: 3_000, minContributionCents: 1_000 }))).toBe("invalid_amount");
  });
});
