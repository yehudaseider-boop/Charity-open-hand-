import { describe, expect, it } from "vitest";
import { biggestGift, inTaxYear, longestRun, monthsOfTaxYear, shares, splits } from "../apps/mobile/src/lib/insights";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const gift = (date: Date, cents: number, slug: string, extra: Partial<{ monthly: boolean; with18a: boolean }> = {}) => ({
  date,
  cents,
  charitySlug: slug,
  charityName: slug.toUpperCase(),
  monthly: extra.monthly ?? false,
  with18a: extra.with18a ?? true,
});

describe("app giving insights", () => {
  const gifts = [
    gift(d(2026, 3, 1), 10_000, "a"),
    gift(d(2026, 4, 2), 20_000, "b", { monthly: true }),
    gift(d(2026, 4, 20), 5_000, "a", { with18a: false }),
    gift(d(2027, 2, 28), 7_000, "c"),
    gift(d(2027, 3, 1), 99_000, "d"), // next tax year
  ];

  it("lays out March to February, with totals, gifts and future months", () => {
    const months = monthsOfTaxYear(inTaxYear(gifts, 2027), 2027, d(2026, 10, 26));
    expect(months).toHaveLength(12);
    expect(months[0]).toMatchObject({ label: "March 2026", short: "M", cents: 10_000, future: false });
    expect(months[1].cents).toBe(25_000);
    expect(months[1].gifts.map((g) => g.cents)).toEqual([5_000, 20_000]); // newest first
    expect(months[11]).toMatchObject({ label: "February 2027", cents: 7_000, future: true });
    expect(months[7]).toMatchObject({ label: "October 2026", future: false });
    expect(months[8].future).toBe(true);
  });

  it("splits the total into shares, largest first, folding the smallest into Other", () => {
    const rows = [gift(d(2026, 5, 1), 50_000, "a"), gift(d(2026, 5, 1), 30_000, "b"), gift(d(2026, 5, 1), 10_000, "c"), gift(d(2026, 5, 1), 6_000, "d"), gift(d(2026, 5, 1), 4_000, "e")];
    const s = shares(rows, (g) => ({ key: g.charitySlug, name: g.charityName }));
    expect(s.map((r) => [r.key, r.cents, r.percent])).toEqual([["a", 50_000, 50], ["b", 30_000, 30], ["c", 10_000, 10], ["other", 10_000, 10]]);
    expect(s[3].name).toBe("Other (2)");
    // A single leftover is still the grey Other slice, but keeps its own name.
    const four = shares(rows.slice(0, 4), (g) => ({ key: g.charitySlug, name: g.charityName }));
    expect(four.map((r) => [r.key, r.name])).toEqual([["a", "A"], ["b", "B"], ["c", "C"], ["other", "D"]]);
    expect(shares(rows.slice(0, 3), (g) => ({ key: g.charitySlug, name: g.charityName })).map((r) => r.key)).toEqual(["a", "b", "c"]);
    expect(shares(rows.slice(0, 0), (g) => ({ key: g.charitySlug, name: g.charityName }))).toEqual([]);
  });

  it("finds the longest run of months with a gift, across a year end", () => {
    expect(longestRun([d(2026, 11, 3), d(2026, 12, 1), d(2027, 1, 9), d(2027, 3, 1)])).toBe(3);
    expect(longestRun([d(2026, 5, 1), d(2026, 5, 20)])).toBe(1);
    expect(longestRun([])).toBe(0);
  });

  it("finds the biggest gift and the splits", () => {
    expect(biggestGift(inTaxYear(gifts, 2027))?.cents).toBe(20_000);
    expect(biggestGift([])).toBeNull();
    expect(splits(inTaxYear(gifts, 2027))).toEqual({ total: 42_000, with18a: 37_000, without18a: 5_000, monthly: 20_000, onceOff: 22_000 });
  });
});
