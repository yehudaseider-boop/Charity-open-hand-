import { describe, expect, it } from "vitest";
import { changeSince, chartScale, giftSourceCounts, monthsFrom } from "@/lib/charity/overview";

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
});

describe("how a figure moved", () => {
  it("shows a rounded percentage and its direction", () => {
    expect(changeSince(11_400, 10_000)).toEqual({ percent: 14, up: true });
    expect(changeSince(8_000, 10_000)).toEqual({ percent: 20, up: false });
    expect(changeSince(10_000, 10_000)).toEqual({ percent: 0, up: true });
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
    expect(chartScale(30_000).top).toBe(50_000); // R300 -> R500
    expect(chartScale(2_000_000).top).toBe(2_000_000); // exactly R20 000 stays R20 000
    expect(chartScale(2_000_001).top).toBe(5_000_000);
  });
  it("has a sensible chart when nothing has been given", () => {
    const s = chartScale(0);
    expect(s.top).toBeGreaterThan(0);
    expect(s.ticks).toHaveLength(5);
  });
});
