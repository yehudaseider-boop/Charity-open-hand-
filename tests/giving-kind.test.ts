/**
 * Each gift is counted as maaser, chomesh or general tzedaka. The donor must
 * choose: there is no default.
 */
import { describe, expect, it } from "vitest";
import { checkoutSchema } from "@/lib/donations/validation";
import { sumOfKind } from "../apps/mobile/src/lib/giving";

const base = { donor_type: "individual", email: "donor@example.com", first_name: "A", last_name: "B" };

describe("checkout: what the gift is counted as", () => {
  it("accepts maaser, chomesh and general tzedaka", () => {
    for (const giving_kind of ["maaser", "chomesh", "tzedaka"]) {
      expect(checkoutSchema.safeParse({ ...base, giving_kind }).success).toBe(true);
    }
  });

  it("refuses a gift with no choice", () => {
    const r = checkoutSchema.safeParse(base);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path[0]).toBe("giving_kind");
    expect(r.error?.issues[0].message).toMatch(/maaser, chomesh or general tzedaka/);
  });

  it("refuses anything else", () => {
    expect(checkoutSchema.safeParse({ ...base, giving_kind: "other" }).success).toBe(false);
  });
});

describe("phone app: totals per kind", () => {
  it("adds up only the rows of that kind", () => {
    const rows = [
      { cents: 50_000, kind: "maaser" },
      { cents: 36_000, kind: "chomesh" },
      { cents: 18_000, kind: "tzedaka" },
      { cents: 1_000, kind: "maaser" },
    ];
    expect(sumOfKind(rows, "maaser")).toBe(51_000);
    expect(sumOfKind(rows, "chomesh")).toBe(36_000);
    expect(sumOfKind(rows, "tzedaka")).toBe(18_000);
  });
});
