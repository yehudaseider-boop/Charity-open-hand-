/**
 * A donor may give each gift their own label ("Work giving", "Maaser"). Optional, private to them.
 * Older app versions still send maaser / chomesh / tzedaka; those become labels.
 */
import { describe, expect, it } from "vitest";
import { checkoutSchema, givingLabelOf } from "@/lib/donations/validation";
import { cleanLabel, labelOf, sameLabel } from "@/lib/donations/labels";

const base = { donor_type: "individual", email: "donor@example.com", first_name: "A", last_name: "B" };

describe("checkout: the donor's own label", () => {
  it("is optional", () => {
    const r = checkoutSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(givingLabelOf(r.data!)).toBeNull();
  });
  it("keeps what the donor typed, tidied and at most 40 characters", () => {
    const r = checkoutSchema.parse({ ...base, giving_label: "  Work   giving " });
    expect(givingLabelOf(r)).toBe("Work giving");
    expect(cleanLabel("x".repeat(60))).toHaveLength(40);
    expect(cleanLabel("a\u0000b")).toBe("a b");
    expect(cleanLabel("   ")).toBeNull();
  });
  it("an older app's fixed choice becomes a label; anything else is refused", () => {
    expect(givingLabelOf(checkoutSchema.parse({ ...base, giving_kind: "maaser" }))).toBe("Maaser");
    expect(checkoutSchema.safeParse({ ...base, giving_kind: "other" }).success).toBe(false);
  });
  it("old rows read as labels, and labels match whatever the case", () => {
    expect(labelOf({ kind: "chomesh", label: null })).toBe("Chomesh");
    expect(labelOf({ kind: "maaser", label: "Family" })).toBe("Family");
    expect(labelOf(null)).toBeNull();
    expect(sameLabel("maaser", "Maaser ")).toBe(true);
    expect(sameLabel(null, "Maaser")).toBe(false);
  });
  it("every old stored kind still reads, never crashes, and nothing else is guessed", () => {
    expect([labelOf({ kind: "maaser" }), labelOf({ kind: "chomesh" }), labelOf({ kind: "tzedaka" })]).toEqual(["Maaser", "Chomesh", "Tzedaka"]);
    expect(labelOf({ kind: "gift" })).toBeNull();
    expect(labelOf({ kind: "constructor" })).toBeNull();
    expect(labelOf({ kind: "toString", label: "  " })).toBeNull();
  });
});
