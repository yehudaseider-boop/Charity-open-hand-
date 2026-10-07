/** The phone app's pure helpers (apps/mobile/src/lib). */
import { describe, expect, it } from "vitest";
import { checkAmount } from "../apps/mobile/src/lib/amount";
import { rand, ddmmyyyy } from "../apps/mobile/src/lib/format";
import { taxYearFor, taxYearRangeLabel } from "../apps/mobile/src/lib/tax-year";

describe("app amount check (R30 minimum)", () => {
  it.each([
    ["30", { ok: true, cents: 3000 }],
    ["180", { ok: true, cents: 18000 }],
    ["1 250,50", { ok: true, cents: 125050 }],
    ["29.99", { ok: false, reason: "below_minimum" }],
    ["29", { ok: false, reason: "below_minimum" }],
    ["", { ok: false, reason: "empty" }],
    ["abc", { ok: false, reason: "invalid" }],
    ["0", { ok: false, reason: "invalid" }],
  ])("%s", (input, expected) => {
    expect(checkAmount(input, 3000)).toEqual(expected);
  });
});

describe("app Rand format", () => {
  it("drops cents on whole Rand, keeps them otherwise", () => {
    expect(rand(3000)).toBe("R30");
    expect(rand(125000)).toBe("R1 250");
    expect(rand(3457)).toBe("R34.57");
  });
  it("dd/mm/yyyy", () => {
    expect(ddmmyyyy(new Date(2026, 9, 7))).toBe("07/10/2026");
  });
});

describe("app tax year (SARS)", () => {
  it("1 March starts the next tax year", () => {
    expect(taxYearFor(new Date(2026, 1, 28))).toBe(2026);
    expect(taxYearFor(new Date(2026, 2, 1))).toBe(2027);
    expect(taxYearFor(new Date(2027, 1, 28))).toBe(2027);
  });
  it("labels leap years", () => {
    expect(taxYearRangeLabel(2027)).toBe("01/03/2026 to 28/02/2027");
    expect(taxYearRangeLabel(2028)).toBe("01/03/2027 to 29/02/2028");
  });
});
