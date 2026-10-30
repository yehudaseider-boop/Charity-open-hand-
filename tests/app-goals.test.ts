import { describe, expect, it } from "vitest";
import { cleanGoals, counts, goalProgress, goalWindow, goalsFromOldTarget, knownLabels, ppmToPercentText, type Goal } from "../apps/mobile/src/lib/goals";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const goal = (over: Partial<Goal> = {}): Goal => ({ id: "g", name: "Giving goal", basis: "fixed", percentPpm: null, fixedCents: 1_200_000, period: "year", year: "tax", counts: null, ...over });

describe("giving goals", () => {
  it("a yearly goal follows the SARS tax year by default", () => {
    const w = goalWindow(goal(), d(2026, 10, 16));
    expect(w.label).toBe("2026/27 tax year");
    expect(w.endLabel).toBe("28/02/2027");
    expect(w.monthsLeft).toBe(5);
  });
  it("a monthly goal is this calendar month", () => {
    expect(goalWindow(goal({ period: "month" }), d(2026, 2, 10))).toMatchObject({ label: "February 2026", endLabel: "28/02/2026", monthsLeft: 1 });
  });
  it("counts all giving, or only gifts with its labels, whatever their case", () => {
    const rows = [
      { date: d(2026, 4, 1), cents: 50_000, label: "maaser" },
      { date: d(2026, 5, 1), cents: 20_000, label: "Family" },
      { date: d(2026, 6, 1), cents: 10_000, label: null },
      { date: d(2025, 6, 1), cents: 99_000, label: null }, // last tax year
    ];
    const today = d(2026, 10, 16);
    expect(goalProgress(goal(), rows, [], today)).toMatchObject({ targetCents: 1_200_000, givenCents: 80_000, leftCents: 1_120_000, perMonthCents: 224_000 });
    expect(goalProgress(goal({ counts: ["Maaser"] }), rows, [], today).givenCents).toBe(50_000);
    expect(counts({ counts: ["Maaser"] }, null)).toBe(false);
  });
  it("a share of income needs income logged in the period, and rounds to the cent", () => {
    const g = goal({ basis: "income", percentPpm: 100_000, fixedCents: null });
    const today = d(2026, 10, 16);
    expect(goalProgress(g, [], [], today).targetCents).toBeNull();
    const p = goalProgress(g, [{ date: d(2026, 9, 1), cents: 30_000, label: null }], [{ date: "2026-09-25", cents: 4_500_005 }, { date: "2026-01-01", cents: 9_999_999 }], today);
    expect(p).toMatchObject({ incomeCents: 4_500_005, targetCents: 450_001, givenCents: 30_000, leftCents: 420_001 });
  });
  it("reads back only well-formed goals, at most three", () => {
    const good = goal();
    expect(cleanGoals([good, { ...good, basis: "income", percentPpm: 0 }, null, "x", good, good, good])).toHaveLength(3);
    expect(cleanGoals("nope")).toEqual([]);
    expect(cleanGoals([{ ...good, counts: [" Maaser ", ""] }])[0].counts).toEqual(["Maaser"]);
  });
  it("a much older version's targets become goals, keeping their own names, now on the tax year", () => {
    expect(goalsFromOldTarget({ period: "month", maaserCents: 60_000, chomeshCents: 60_000 }).map((g) => [g.name, g.fixedCents, g.counts, g.year])).toEqual([
      ["Maaser", 60_000, ["Maaser"], "tax"],
      ["Chomesh", 60_000, ["Chomesh"], "tax"],
    ]);
    expect(goalsFromOldTarget(null)).toEqual([]);
  });
  it("a goal saved with the old Hebrew-year option is kept, and now counts the tax year", () => {
    const old = { ...goal({ name: "Maaser", basis: "income", percentPpm: 100_000, fixedCents: null, counts: ["Maaser"] }), year: "hebrew" };
    const [g] = cleanGoals([old]);
    expect(g).toEqual({ ...old, year: "tax" });
    expect(goalWindow(g, d(2026, 10, 16)).label).toBe("2026/27 tax year");
  });
  it("shows percentages and the donor's labels simply", () => {
    expect(ppmToPercentText(100_000)).toBe("10%");
    expect(ppmToPercentText(125_000)).toBe("12.5%");
    expect(knownLabels([{ label: "Family" }, { label: "family" }, { label: "Work" }, { label: null }], ["Gifts"])).toEqual(["Family", "Work", "Gifts"]);
  });
});
