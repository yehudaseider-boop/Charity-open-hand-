import { describe, expect, it } from "vitest";
import { quoteFromTyped } from "@/lib/donations/quote";
import { looksLikeAmount } from "@/lib/money";

describe("a typed amount far too large to count", () => {
  it("says the maximum, not 'enter an amount'", () => {
    const r = quoteFromTyped("99999999999999", "none", "", false);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.field).toBe("amount");
      expect(r.message).toMatch(/^The most you can give online in one go is R/);
    }
  });
  it("still asks for an amount when it isn't one", () => {
    const r = quoteFromTyped("abc", "none", "", false);
    expect(!r.ok && r.message).toBe("Enter an amount in Rand, for example 180 or 180.50.");
  });
  it("knows an amount when it sees one", () => {
    expect(looksLikeAmount("R 99 999 999 999 999")).toBe(true);
    expect(looksLikeAmount("1250.50")).toBe(true);
    expect(looksLikeAmount("12.555")).toBe(false);
    expect(looksLikeAmount("-50")).toBe(false);
  });
});
