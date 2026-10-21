import { describe, expect, it } from "vitest";
import { parseSuggestedAmounts, tapAmounts } from "@/lib/charity/suggested-amounts";

describe("a charity's suggested amounts", () => {
  it("takes up to three Rand amounts, skips blanks, smallest first", () => {
    expect(parseSuggestedAmounts(["1 000", "", "180"], 3000, "R30")).toEqual({ ok: true, cents: [18_000, 100_000] });
    expect(parseSuggestedAmounts(["", "", ""], 3000, "R30")).toEqual({ ok: true, cents: [] });
    expect(parseSuggestedAmounts(["R180,50"], 3000, "R30")).toEqual({ ok: true, cents: [18_050] });
  });
  it("refuses what isn't an amount, below the minimum, or a repeat, against the right box", () => {
    const r = parseSuggestedAmounts(["abc", "20", "180"], 3000, "R30");
    expect(r).toEqual({ ok: false, fieldErrors: { suggested_1: expect.stringMatching(/Rand/), suggested_2: "The smallest donation is R30" } });
    expect(parseSuggestedAmounts(["180", "180"], 3000, "R30")).toEqual({ ok: false, fieldErrors: { suggested_2: "You already have this amount" } });
  });
});

describe("the amounts a donor can tap", () => {
  it("puts the donor's own amounts first, then the charity's, three at most, no repeats", () => {
    expect(tapAmounts([25_000], [18_000, 25_000, 50_000])).toEqual([25_000, 18_000, 50_000]);
    expect(tapAmounts([], [18_000])).toEqual([18_000]);
  });
  it("suggests nothing of its own: no history and no charity amounts means none", () => {
    expect(tapAmounts([], [])).toEqual([]);
  });
});
