import { describe, expect, it } from "vitest";
import { checkImpactUnit, impactCount, impactLine, impactSource, impactTotal, impactUnitFrom } from "@/lib/charity/impact";

const breakfast = { cents: 1200, one: "school breakfast", many: "school breakfasts" };

describe("what a gift pays for, in the charity's own figure", () => {
  it("counts whole things only, rounding down", () => {
    expect(impactCount(36000, breakfast)).toBe(30);
    expect(impactCount(1199, breakfast)).toBe(0);
    expect(impactCount(1200, breakfast)).toBe(1);
    expect(impactCount(0, breakfast)).toBe(0);
    expect(impactCount(-500, breakfast)).toBe(0);
  });
  it("writes the line, for one, many, monthly and large amounts", () => {
    expect(impactLine(36000, breakfast)).toBe("R360 pays for 30 school breakfasts");
    expect(impactLine(36000, breakfast, { you: true })).toBe("Your R360 pays for 30 school breakfasts");
    expect(impactLine(1250, breakfast)).toBe("R12.50 pays for one school breakfast");
    expect(impactLine(50000, breakfast, { you: true, monthly: true })).toBe("Your R500 a month pays for 41 school breakfasts a month");
    expect(impactLine(5_427_600, breakfast)).toBe("R54 276 pays for 4 523 school breakfasts");
  });
  it("says nothing below the cost of one", () => {
    expect(impactLine(1000, breakfast)).toBeNull();
    expect(impactTotal(500, breakfast)).toBeNull();
  });
  it("names the source every time", () => {
    expect(impactSource("PSFA", breakfast)).toBe("Figure from PSFA: R12 pays for one school breakfast.");
    expect(impactTotal(5_427_600, breakfast)).toBe("about 4 523 school breakfasts");
  });
  it("reads a charity's row, and ignores an incomplete one", () => {
    expect(impactUnitFrom({ impact_unit_cents: "1200", impact_unit_one: " school breakfast ", impact_unit_many: "school breakfasts" })).toEqual(breakfast);
    expect(impactUnitFrom({ impact_unit_cents: 1200, impact_unit_one: null, impact_unit_many: "x" })).toBeNull();
    expect(impactUnitFrom({ impact_unit_cents: null })).toBeNull();
    expect(impactUnitFrom(null)).toBeNull();
  });
});

describe("checking what the charity typed", () => {
  it("clears the figure when all three are empty", () => {
    expect(checkImpactUnit({ amount: " ", one: "", many: "" })).toEqual({ ok: true, unit: null });
  });
  it("accepts a figure and tidies the names", () => {
    expect(checkImpactUnit({ amount: "R12", one: " school  breakfast.", many: "school breakfasts" })).toEqual({ ok: true, unit: breakfast });
    expect(checkImpactUnit({ amount: "1 250,50", one: "food parcel", many: "food parcels" })).toEqual({ ok: true, unit: { cents: 125050, one: "food parcel", many: "food parcels" } });
  });
  it("needs all three, and explains each problem", () => {
    const r = checkImpactUnit({ amount: "12", one: "", many: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(["impact_unit_many", "impact_unit_one"]);
    const s = checkImpactUnit({ amount: "", one: "x", many: "y" });
    expect(!s.ok && s.fieldErrors.impact_unit_amount).toBe("Enter what one costs, for example 12");
  });
  it("refuses silly amounts and names", () => {
    const bad = (amount: string, one = "meal", many = "meals") => { const r = checkImpactUnit({ amount, one, many }); return r.ok ? null : r.fieldErrors; };
    expect(bad("abc")?.impact_unit_amount).toMatch(/numbers only/);
    expect(bad("0.50")?.impact_unit_amount).toMatch(/smallest is R1/);
    expect(bad("200000")?.impact_unit_amount).toMatch(/largest is R100 000/);
    expect(bad("1,250")?.impact_unit_amount).toMatch(/space or nothing/);
    expect(bad("12", "2 meals")?.impact_unit_one).toMatch(/Leave the number out/);
    expect(bad("12", "x".repeat(61))?.impact_unit_one).toMatch(/60 characters/);
  });
});
