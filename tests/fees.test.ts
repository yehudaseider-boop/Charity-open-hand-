import { describe, expect, it } from "vitest";
import { platformConfig } from "@/config/platform";
import { FeeError, priceDonation } from "@/lib/fees";

const mins = { minDonationCents: platformConfig.minDonationCents, minContributionCents: platformConfig.minContributionCents };

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

  it("refuses broken amounts", () => {
    for (const [a, c] of [[0, 0], [-100, 0], [30.5, 0], [Number.NaN, 0], [3_000, -1], [3_000, 0.5], [Number.MAX_SAFE_INTEGER, 1_000]]) {
      expect(code(() => priceDonation(a, c, mins))).toBe("invalid_amount");
    }
  });
});
