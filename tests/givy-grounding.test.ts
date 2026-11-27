/**
 * Givy never invents a figure (27/11/2026): every Rand amount in an answer must come from what it looked up, or be a
 * sum or difference of two such amounts; anything else is named in a plain note at the end of the answer.
 */
import { describe, expect, it } from "vitest";
import { amountsIn, trustedChat, unmatchedAmounts, unmatchedNote } from "@/lib/assistant/grounding";
import { formatRand } from "@/lib/money";

const found = [JSON.stringify({ period: "November 2026", raised: "R9 210", gifts: 21, last_month: "R12 170", s18a_cents: 425000 })];

describe("amounts in Givy's words", () => {
  it("reads the ways an amount is written", () => {
    expect(amountsIn("R9 210, R34.57, R1,250 and R 300; R1 000 000.")).toEqual([921_000, 3_457, 125_000, 30_000, 100_000_000]);
    expect(amountsIn("21 gifts, 14 donors, 2026")).toEqual([]);
  });
  // Review 27/11/2026: misread or skipped forms.
  it("is never fooled by letters before the R", () => {
    expect(amountsIn("Fill in the ITR12 form, reference XR1234.")).toEqual([]);
  });
  it("reads a comma before cents, and the narrow and thin spaces some writers use", () => {
    expect(amountsIn("R1 250,50 and R1 250.5")).toEqual([125_050, 125_050]);
    expect(amountsIn("R1 250 000,00")).toEqual([125_000_000]);
    expect(amountsIn("R1\u202f250 and R1\u2009250 and R1\u00a0250")).toEqual([125_000, 125_000, 125_000]);
  });
  it("checks millions, thousands and Rand in words at their full size", () => {
    expect(amountsIn("R2 million, R1.2 million, R3,5 million, R12k, R2m")).toEqual([200_000_000, 120_000_000, 350_000_000, 1_200_000, 200_000_000]);
    expect(amountsIn("about 1 250 rand, or 300 rands")).toEqual([125_000, 30_000]);
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
  it("a figure an earlier answer's own note flagged doesn't count as found the next time", () => {
    const chat = trustedChat([
      { role: "user", content: "How much this year?" },
      { role: "assistant", content: "About R15 000 a month, and R9 210 this month.\n\nI couldn't match R15 000 to your records. Please check that figure on the dashboard before you rely on it." },
    ]);
    expect(unmatchedAmounts("Yes, R15 000 a month.", chat)).toEqual([1_500_000]);
    expect(unmatchedAmounts("Yes, R9 210 this month.", chat)).toEqual([]);
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
