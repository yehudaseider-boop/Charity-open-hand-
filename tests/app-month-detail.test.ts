/** The Progress month panel: what was given against the month's share, in plain words, never guilt. */
import { describe, expect, it } from "vitest";
import { goalProgress, type Goal } from "../apps/mobile/src/lib/goals";
import { monthDetail, type MonthRow } from "../apps/mobile/src/lib/month-detail";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const k = (y: number, m: number) => y * 12 + (m - 1);
const goal = (over: Partial<Goal> = {}): Goal => ({ id: "g", name: "Giving goal", basis: "fixed", percentPpm: null, fixedCents: 1_200_000, period: "year", year: "tax", counts: null, ...over });
const today = d(2026, 10, 16);
const rows: MonthRow[] = [
  { id: "a", date: d(2026, 6, 10), cents: 50_000, label: "Family", charityName: "Meals Fund" },
  { id: "b", date: d(2026, 6, 20), cents: 22_000, label: null, recipient: "School fun run" },
  { id: "c", date: d(2026, 8, 1), cents: 120_000, label: null, charityName: "Learning Centre" },
  { id: "d", date: d(2026, 9, 1), cents: 100_000, label: null, charityName: "Learning Centre" },
  { id: "e", date: d(2026, 10, 2), cents: 86_000, label: null, charityName: "Meals Fund" },
];
const detail = (key: number, g = goal(), r = rows) => monthDetail(g, r, today, key, goalProgress(g, r, [], today));

describe("month panel", () => {
  it("a past month under its share: the amount, the share, the gifts, and one plain line", () => {
    const m = detail(k(2026, 6));
    expect(m).toMatchObject({ title: "June 2026", when: "past", givenCents: 72_000, shareCents: 100_000, line: "R280 under June's share." });
    expect(m.gifts.map((g) => [g.name, g.elsewhere])).toEqual([["School fun run", true], ["Meals Fund", false]]);
  });
  it("over, exactly and nothing", () => {
    expect(detail(k(2026, 8)).line).toBe("R200 over August's share.");
    expect(detail(k(2026, 9)).line).toBe("September's share reached.");
    expect(detail(k(2026, 7)).line).toBe("No gifts in July.");
  });
  it("this month says what is left to go", () => {
    expect(detail(k(2026, 10))).toMatchObject({ when: "current", line: "R140 to go this month." });
  });
  it("a future month shows the plan to reach the goal", () => {
    // R12 000 - R3 780 = R8 220 over the 5 months left (Oct to Feb) = R1 644 a month.
    expect(detail(k(2026, 12))).toMatchObject({ when: "future", line: "About R1 644 a month gets you to R12 000 by 28/02/2027." });
  });
  it("a reached goal says anything more is extra", () => {
    expect(detail(k(2026, 12), goal({ fixedCents: 300_000 })).line).toBe("Goal reached. Anything more is extra.");
  });
  it("a share of income with no income logged asks for the income instead of guessing", () => {
    const g = goal({ basis: "income", percentPpm: 100_000, fixedCents: null });
    expect(detail(k(2026, 6), g)).toMatchObject({ shareCents: null, line: "Log your income to see this month's share." });
  });
  it("never uses guilt words", () => {
    const all = Array.from({ length: 12 }, (_, i) => detail(k(2026, 3) + i).line ?? "").join(" ");
    expect(all).not.toMatch(/fell short|missed|only|less than|behind|failed/i);
  });
});
