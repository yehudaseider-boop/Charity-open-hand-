import { describe, expect, it } from "vitest";
import { changeSince, chartScale, giftSourceCounts, monthsFrom, wholePercents } from "@/lib/charity/overview";

describe("where gifts came from", () => {
  it("counts every gift once, most first, with whole-number percentages", () => {
    const rows = [
      ...Array(5).fill({ came_from: "website" }),
      ...Array(3).fill({ came_from: "qr" }),
      { came_from: "whatsapp" },
      { came_from: "website_button" },
    ];
    const out = giftSourceCounts(rows);
    expect(out.map((r) => [r.label, r.count, r.percent])).toEqual([
      ["Website", 5, 50],
      ["QR poster", 3, 30],
      ["Website button", 1, 10],
      ["WhatsApp", 1, 10],
    ]);
    expect(out.reduce((t, r) => t + r.count, 0)).toBe(rows.length);
  });
  it("calls a gift with no source, or an unknown one, 'Not known'", () => {
    const out = giftSourceCounts([{ came_from: null }, { came_from: "constructor" }, { came_from: "app" }]);
    expect(out.find((r) => r.key === "unknown")).toMatchObject({ label: "Not known", count: 2, percent: 67 });
    expect(out.find((r) => r.key === "app")?.label).toBe("App");
  });
  it("is empty with no gifts, never dividing by zero", () => {
    expect(giftSourceCounts([])).toEqual([]);
  });
  it("adds its percentages up to exactly 100, where plain rounding gave 101", () => {
    // 94, 66, 30, 15, 14, 6 and 6 of 231: plain rounding gives 41+29+13+6+6+3+3 = 101.
    const rows = [[94, "website"], [66, "app"], [30, "share_link"], [15, "qr"], [14, "whatsapp"], [6, "recorded"], [6, "website_button"]]
      .flatMap(([n, k]) => Array(n as number).fill({ came_from: k }));
    const out = giftSourceCounts(rows);
    expect(out.reduce((t, r) => t + r.percent, 0)).toBe(100);
    expect(out.map((r) => r.percent)).toEqual([41, 28, 13, 6, 6, 3, 3]);
  });
});

describe("whole percentages", () => {
  it("gives the leftover points to the largest remainders, earliest first on a tie", () => {
    expect(wholePercents([1, 1, 1])).toEqual([34, 33, 33]);
    expect(wholePercents([2, 1])).toEqual([67, 33]);
    expect(wholePercents([5, 3, 1, 1])).toEqual([50, 30, 10, 10]);
    expect(wholePercents([1, 0])).toEqual([100, 0]);
  });
  it("is all zeros with nothing to share", () => {
    expect(wholePercents([])).toEqual([]);
    expect(wholePercents([0, 0])).toEqual([0, 0]);
  });
});

describe("how a figure moved", () => {
  it("shows a rounded percentage and its direction", () => {
    expect(changeSince(11_400, 10_000)).toEqual({ percent: 14, up: true });
    expect(changeSince(8_000, 10_000)).toEqual({ percent: 20, up: false });
    expect(changeSince(10_000, 10_000)).toEqual({ percent: 0, up: true });
    expect(changeSince(9_960, 10_000)).toEqual({ percent: 0, up: false }); // a small fall is never shown as a rise
  });
  it("shows nothing when there was nothing before to compare with", () => {
    expect(changeSince(5_000, 0)).toBeNull();
    expect(changeSince(0, 0)).toBeNull();
    expect(changeSince(5_000, Number.NaN)).toBeNull();
  });
});

describe("the tax-year view of the chart", () => {
  const months = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-10-01"].map((month) => ({ month }));
  it("starts at March, when the tax year starts", () => {
    expect(monthsFrom(months, "2026-03-01").map((m) => m.month)).toEqual(["2026-03-01", "2026-04-01", "2026-10-01"]);
  });
  it("is empty before the tax year has any month in the list", () => {
    expect(monthsFrom(months, "2027-03-01")).toEqual([]);
  });
});

describe("the chart's amounts", () => {
  it("tops out at a round number just above the highest month, in four equal steps", () => {
    expect(chartScale(1_845_000)).toEqual({ top: 2_000_000, ticks: [0, 500_000, 1_000_000, 1_500_000, 2_000_000] }); // R18 450 -> R20 000
    expect(chartScale(30_000)).toEqual({ top: 40_000, ticks: [0, 10_000, 20_000, 30_000, 40_000] }); // R300 -> R100 steps
    expect(chartScale(2_000_000).top).toBe(2_000_000); // exactly R20 000 stays R20 000
    expect(chartScale(2_000_001).top).toBe(4_000_000);
    expect(chartScale(900_000).ticks).toEqual([0, 250_000, 500_000, 750_000, 1_000_000]); // R9 000 -> R2 500 steps
  });
  it("labels every step with a round number of whole Rand", () => {
    for (const cents of [1, 99, 4_321, 30_000, 123_456, 999_999, 7_777_777, 123_456_789]) {
      const { top, ticks } = chartScale(cents);
      expect(top).toBeGreaterThanOrEqual(cents);
      const step = ticks[1];
      expect(step % 100).toBe(0);
      const lead = step / 100 / 10 ** Math.floor(Math.log10(step / 100));
      expect([1, 2, 2.5, 5]).toContain(lead);
      expect(ticks).toEqual([0, step, step * 2, step * 3, step * 4]);
    }
  });
  it("has a sensible chart when nothing has been given", () => {
    const s = chartScale(0);
    expect(s.top).toBeGreaterThan(0);
    expect(s.ticks).toHaveLength(5);
  });
});
