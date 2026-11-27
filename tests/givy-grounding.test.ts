/**
 * Givy never invents a figure (27/11/2026): every Rand amount in an answer must come from what it looked up, or be a
 * sum or difference of two such amounts; anything else is named in a plain note at the end of the answer.
 */
import { describe, expect, it } from "vitest";
import { amountsIn, unmatchedAmounts, unmatchedNote } from "@/lib/assistant/grounding";
import { formatRand } from "@/lib/money";

const found = [JSON.stringify({ period: "November 2026", raised: "R9 210", gifts: 21, last_month: "R12 170", s18a_cents: 425000 })];

describe("amounts in Givy's words", () => {
  it("reads the ways an amount is written", () => {
    expect(amountsIn("R9 210, R34.57, R1,250 and R 300; R1 000 000.")).toEqual([921_000, 3_457, 125_000, 30_000, 100_000_000]);
    expect(amountsIn("21 gifts, 14 donors, 2026")).toEqual([]);
  });
});

describe("matching them to the lookups", () => {
  it("an amount from the lookup, in Rand or in cents, is fine", () => {
    expect(unmatchedAmounts("R9 210 came in, R4 250 with an s18A receipt asked for.", found)).toEqual([]);
  });
  it("a difference or a sum of two found amounts is fine", () => {
    expect(unmatchedAmounts("That is R2 960 less than last month's R12 170.", found)).toEqual([]);
    expect(unmatchedAmounts("Together R21 380 over two months.", found)).toEqual([]);
  });
  it("an amount that matches nothing is named", () => {
    expect(unmatchedAmounts("R9 210 came in, about R15 000 a month on average.", found)).toEqual([1_500_000]);
  });
  it("an amount the person typed, or an earlier answer gave, counts as found", () => {
    expect(unmatchedAmounts("Yes, R500 is more than your goal.", [...found, "Is R500 a lot?"])).toEqual([]);
  });
  it("with no lookup at all, any amount is named", () => {
    expect(unmatchedAmounts("You raised R50 000 this year.", [])).toEqual([5_000_000]);
  });
});

describe("the note", () => {
  it("names the figures in plain words, and says nothing when all match", () => {
    expect(unmatchedNote([1_500_000], formatRand)).toBe("\n\nI couldn't match R15 000 to your records. Please check that figure on the dashboard before you rely on it.");
    expect(unmatchedNote([100, 200], formatRand)).toContain("check those figures");
    expect(unmatchedNote([], formatRand)).toBe("");
  });
});
