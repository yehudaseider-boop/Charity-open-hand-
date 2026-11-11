/** The give screen's amount dial, "Same as last time", and the hello in the thank-you. */
import { describe, expect, it } from "vitest";
import { amountFromParam, lastGiftTo, stepAmount, stepSize, stripGivePrefill } from "../apps/mobile/src/lib/amount-steps";
import { firstNameOf, yourCampaigns } from "../apps/mobile/src/lib/campaign-feed";
import type { Campaign, Charity } from "../apps/mobile/src/data/sample";

const MIN = 3_000; // R30, the smallest gift
const MAX = 100_000_000;

describe("stepping an amount", () => {
  it("steps by R10 under R100, R50 under R500, R100 under R2 000 and R500 above", () => {
    expect([stepSize(3_000), stepSize(9_999), stepSize(10_000), stepSize(49_999), stepSize(50_000), stepSize(199_999), stepSize(200_000)]).toEqual([1_000, 1_000, 5_000, 5_000, 10_000, 10_000, 50_000]);
  });

  it("goes up to the next step, and snaps an in-between amount to the dial", () => {
    expect(stepAmount(5_000, 1, MIN, MAX)).toBe(6_000); // R50 to R60
    expect(stepAmount(13_750, 1, MIN, MAX)).toBe(15_000); // R137.50 to R150
    expect(stepAmount(50_000, 1, MIN, MAX)).toBe(60_000); // R500 to R600
    expect(stepAmount(250_000, 1, MIN, MAX)).toBe(300_000); // R2 500 to R3 000
  });

  it("goes down by the smaller step at a boundary: R100 to R90, R500 to R450", () => {
    expect(stepAmount(10_000, -1, MIN, MAX)).toBe(9_000);
    expect(stepAmount(50_000, -1, MIN, MAX)).toBe(45_000);
    expect(stepAmount(200_000, -1, MIN, MAX)).toBe(190_000);
    expect(stepAmount(13_750, -1, MIN, MAX)).toBe(10_000);
  });

  it("never invents a figure: no amount yet means nowhere to step", () => {
    expect(stepAmount(null, 1, MIN, MAX)).toBeNull();
    expect(stepAmount(0, 1, MIN, MAX)).toBeNull();
    expect(stepAmount(-500, 1, MIN, MAX)).toBeNull();
    expect(stepAmount(Number.NaN, 1, MIN, MAX)).toBeNull();
  });

  it("stops at the smallest gift and at the largest", () => {
    expect(stepAmount(4_000, -1, MIN, MAX)).toBe(3_000);
    expect(stepAmount(3_000, -1, MIN, MAX)).toBeNull();
    expect(stepAmount(3_500, -1, MIN, MAX)).toBe(3_000);
    expect(stepAmount(99_999_999, 1, MIN, MAX)).toBe(100_000_000);
    expect(stepAmount(100_000_000, 1, MIN, MAX)).toBeNull();
    expect(stepAmount(5_000, 1, MIN, 5_000)).toBeNull();
  });

  it("from below the smallest gift, up goes to the smallest; from above the largest, down goes to the largest", () => {
    expect(stepAmount(500, 1, MIN, MAX)).toBe(3_000); // typed R5, minimum R30
    expect(stepAmount(500, -1, MIN, MAX)).toBeNull();
    expect(stepAmount(200_000_000, -1, MIN, MAX)).toBe(MAX);
    expect(stepAmount(200_000_000, 1, MIN, MAX)).toBeNull();
    expect(stepAmount(500, 1, 3_000, 2_000)).toBeNull(); // a nonsense range never produces an amount
  });

  it("works when the smallest gift isn't known yet (0), without going to nothing", () => {
    expect(stepAmount(1_000, -1, 0, null)).toBeNull();
    expect(stepAmount(2_000, -1, 0, null)).toBe(1_000);
  });
});

describe("same as last time", () => {
  const day = (m: number, d: number) => new Date(2026, m - 1, d);
  const gifts = [
    { charitySlug: "meals", date: day(9, 1), cents: 10_000, monthly: false },
    { charitySlug: "meals", date: day(10, 2), cents: 36_000, monthly: false },
    { charitySlug: "school", date: day(11, 1), cents: 50_000, monthly: true },
  ];
  it("is the most recent gift to this charity, not to any charity", () => {
    expect(lastGiftTo(gifts, "meals")).toEqual({ cents: 36_000, monthly: false });
    expect(lastGiftTo(gifts, "school")).toEqual({ cents: 50_000, monthly: true });
  });
  it("is nothing for a charity the donor hasn't given to", () => {
    expect(lastGiftTo(gifts, "new")).toBeNull();
    expect(lastGiftTo([], "meals")).toBeNull();
  });
});

describe("an amount passed in a link", () => {
  it("accepts whole cents and nothing else", () => {
    expect(amountFromParam("25000")).toBe(25_000);
    expect(amountFromParam(["18000"])).toBe(18_000);
    for (const bad of ["", "0", "-5", "12.5", "1e5", "25000 ", "abc", "1234567890", undefined, null, 5, {}]) expect(amountFromParam(bad)).toBeNull();
  });
});

const camp = (id: string, endsAt: Date | null = null): Campaign => ({ id, title: id, description: null, targetCents: 100_000, raisedCents: 25_000, giftCount: 3, endsAt });
const charity = (slug: string, campaigns: Campaign[]): Charity => ({ slug, nameEn: slug, campaigns } as unknown as Charity);

describe("raising now, from your charities", () => {
  const now = new Date(2026, 10, 11);
  const dir = [charity("a", [camp("a1"), camp("a2")]), charity("b", [camp("b1", new Date(2026, 10, 1))]), charity("c", [camp("c1")]), charity("d", [])];
  it("puts charities the donor gave to first, then saved ones, without repeats", () => {
    const got = yourCampaigns(dir, ["c"], ["a", "c"], 4, now).map((r) => r.campaign.id);
    expect(got).toEqual(["c1", "a1", "a2"]);
  });
  it("leaves out a campaign that has already ended, and charities with none", () => {
    expect(yourCampaigns(dir, ["b", "d"], [], 4, now)).toEqual([]);
  });
  it("shows at most the limit, and ignores slugs that aren't in the directory", () => {
    expect(yourCampaigns(dir, ["zzz", "a"], [], 1, now).map((r) => r.campaign.id)).toEqual(["a1"]);
  });
});

describe("the name in the thank-you", () => {
  it("is the first word typed", () => {
    expect(firstNameOf("  Sarah  Cohen ")).toBe("Sarah");
    expect(firstNameOf("Thandi")).toBe("Thandi");
  });
  it("is nothing when nothing was typed, or when it is silly", () => {
    expect(firstNameOf("")).toBeNull();
    expect(firstNameOf("   ")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf("x".repeat(41))).toBeNull();
  });
});

describe("links from outside the app", () => {
  it("never choose the amount or make a gift monthly", () => {
    expect(stripGivePrefill("/give/meals?monthly=1&amount=999999999")).toBe("/give/meals");
    expect(stripGivePrefill("nedivlev://give/meals?amount=5000&label=Family")).toBe("nedivlev://give/meals?label=Family");
    expect(stripGivePrefill("/give/meals?campaign=abc&monthly=1")).toBe("/give/meals?campaign=abc");
  });
  it("leave everything else alone", () => {
    expect(stripGivePrefill("/give/meals?label=Family")).toBe("/give/meals?label=Family");
    expect(stripGivePrefill("/give/meals")).toBe("/give/meals");
    expect(stripGivePrefill("/charity/meals?amount=5000")).toBe("/charity/meals?amount=5000");
    expect(stripGivePrefill("/donate/return?reference=x")).toBe("/donate/return?reference=x");
  });
});
