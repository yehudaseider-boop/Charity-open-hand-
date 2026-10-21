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
});
