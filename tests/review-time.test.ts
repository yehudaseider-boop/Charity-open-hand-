import { describe, expect, it } from "vitest";
import { platformConfig } from "@/config/platform";
import { reviewWithin } from "@/lib/charity/review-time";

describe("the application review promise", () => {
  it("is the one figure in the platform config (2 working days, Yehuda 30/10/2026)", () => {
    expect(platformConfig.applicationReviewWorkingDays).toBe(2);
    expect(reviewWithin()).toBe("2 working days");
  });
  it("reads naturally for one day", () => {
    expect(reviewWithin(1)).toBe("1 working day");
  });
});
