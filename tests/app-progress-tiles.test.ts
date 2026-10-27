import { describe, expect, it } from "vitest";
import { monthTiles, type Goal } from "../apps/mobile/src/lib/goals";
import { monthsInARow } from "../apps/mobile/src/lib/streak";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const goal = (over: Partial<Goal> = {}): Goal => ({ id: "g", name: "Giving goal", basis: "fixed", percentPpm: null, fixedCents: 1_200_000, period: "year", year: "tax", counts: null, ...over });

describe("months in a row", () => {
  it("counts back from this month and stops at the first gap", () => {
    expect(monthsInARow([d(2026, 10, 2), d(2026, 9, 30), d(2026, 8, 1), d(2026, 6, 1)], d(2026, 10, 16))).toBe(3);
  });
  it("is 0 when nothing was given this month", () => {
    expect(monthsInARow([d(2026, 9, 30)], d(2026, 10, 16))).toBe(0);
  });
  it("crosses the year end", () => {
    expect(monthsInARow([d(2027, 1, 5), d(2026, 12, 5)], d(2027, 1, 20))).toBe(2);
  });
});

describe("month tiles", () => {
  it("shows the tax year March to February, given, past and future", () => {
    const t = monthTiles(goal(), [{ date: d(2026, 3, 4), cents: 100, label: null }, { date: d(2026, 10, 1), cents: 100, label: null }], d(2026, 10, 16));
    expect(t.map((x) => x.label)).toEqual(["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb"]);
    expect(t[0]).toMatchObject({ given: true, future: false });
    expect(t[1]).toMatchObject({ given: false, future: false });
    expect(t[7]).toMatchObject({ given: true, current: true });
    expect(t[8]).toMatchObject({ given: false, future: true });
  });
  it("only counts gifts with the goal's labels", () => {
    const t = monthTiles(goal({ counts: ["Maaser"] }), [{ date: d(2026, 4, 4), cents: 100, label: "Family" }, { date: d(2026, 5, 4), cents: 100, label: "maaser" }], d(2026, 10, 16));
    expect(t[1].given).toBe(false);
    expect(t[2].given).toBe(true);
  });

  it("fills each month by its share of a yearly goal: R12 000 is R1 000 a month", () => {
    const rows = [
      { date: d(2026, 6, 1), cents: 50_000, label: null }, // R500: half
      { date: d(2026, 8, 1), cents: 100_000, label: null }, // R1 000: full
      { date: d(2026, 9, 1), cents: 30_000, label: null }, // R300 and R100 the same month: 40%
      { date: d(2026, 9, 20), cents: 10_000, label: null },
      { date: d(2026, 10, 1), cents: 250_000, label: null }, // R2 500: full, never past full
      { date: d(2026, 4, 1), cents: 1_000, label: null }, // R10: still visibly given
    ];
    const t = monthTiles(goal(), rows, d(2026, 10, 16), 1_200_000);
    expect(t.map((x) => x.fill)).toEqual([0, 150, 0, 500, 0, 1000, 400, 1000, 0, 0, 0, 0]);
  });
  it("a monthly goal fills against its own amount each month", () => {
    const t = monthTiles(goal({ period: "month", fixedCents: 20_000 }), [{ date: d(2026, 5, 3), cents: 10_000, label: null }], d(2026, 10, 16), 20_000);
    expect(t[2].fill).toBe(500);
  });
  it("with no target to measure against, a given month is full", () => {
    const t = monthTiles(goal({ basis: "income", percentPpm: 100_000, fixedCents: null }), [{ date: d(2026, 5, 3), cents: 100, label: null }], d(2026, 10, 16), null);
    expect(t[2].fill).toBe(1000);
    expect(t[3].fill).toBe(0);
  });
});
