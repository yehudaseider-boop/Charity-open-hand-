import { describe, expect, it } from "vitest";
import { buildTaxPack, parseTaxYear, type PackDonationRow } from "@/lib/tax-pack/build";

const row = (over: Partial<PackDonationRow>): PackDonationRow => ({
  id: "d1", paidAt: "2026-10-01T10:00:00Z", charityName: "Northcliff Meals Fund", amountCents: 50_000, wants18a: true, monthly: false, label: "Maaser", ...over,
});

describe("the annual tax pack", () => {
  it("takes only the tax year asked for, by Johannesburg time (1 March to the end of February)", () => {
    const pack = buildTaxPack(2027, [
      // 28/02/2026 23:30 in Johannesburg: still tax year 2026.
      row({ id: "a", paidAt: "2026-02-28T21:30:00Z" }),
      // 01/03/2026 00:30 in Johannesburg (still 28 February in UTC): tax year 2027.
      row({ id: "b", paidAt: "2026-02-28T22:30:00Z", amountCents: 1_000 }),
      // 28/02/2027 23:59 in Johannesburg: last minute of tax year 2027.
      row({ id: "c", paidAt: "2027-02-28T21:59:00Z", amountCents: 2_000 }),
      row({ id: "d", paidAt: "2027-02-28T22:01:00Z" }),
    ], []);
    expect(pack.lines.map((l) => l.id)).toEqual(["b", "c"]);
    expect(pack.totalCents).toBe(3_000);
  });

  it("splits the total into s18A and other donations, in whole cents", () => {
    const pack = buildTaxPack(2027, [
      row({ id: "a", amountCents: 33_333 }),
      row({ id: "b", amountCents: "18000", wants18a: false, charityName: "Glenhazel Hall Trust" }),
      row({ id: "c", amountCents: 1, paidAt: "2026-09-01T08:00:00Z" }),
    ], []);
    expect(pack.totalCents).toBe(51_334);
    expect(pack.s18aCents).toBe(33_334);
    expect(pack.otherCents).toBe(18_000);
    expect(pack.byCharity).toEqual([
      { name: "Northcliff Meals Fund", cents: 33_334, count: 2, s18aCents: 33_334 },
      { name: "Glenhazel Hall Trust", cents: 18_000, count: 1, s18aCents: 0 },
    ]);
  });

  it("lists donations oldest first and totals the donor's own labels, whatever their case", () => {
    const pack = buildTaxPack(2027, [
      row({ id: "late", paidAt: "2026-12-01T08:00:00Z", label: "Work giving", amountCents: 7_000 }),
      row({ id: "early", paidAt: "2026-04-01T08:00:00Z", label: null, amountCents: 3_000 }),
      row({ id: "mid", paidAt: "2026-08-01T08:00:00Z", label: "work GIVING ", amountCents: 1_000 }),
    ], []);
    expect(pack.lines.map((l) => l.id)).toEqual(["early", "mid", "late"]);
    expect(pack.byLabel).toEqual([{ label: "work GIVING", cents: 8_000 }, { label: "No label", cents: 3_000 }]);
  });

  it("shows issued receipts only, and keeps a dedication only when it has words", () => {
    const pack = buildTaxPack(2027, [row({ dedication: "  " }), row({ id: "e", dedication: " In memory of Chaim Cohen " })], [
      { charityName: "Northcliff Meals Fund", reference: "NMF-2027-0001", amountCents: 100_000, issuedAt: "2027-03-09T08:00:00Z", status: "issued" },
      { charityName: "Northcliff Meals Fund", reference: "NMF-2027-0002", amountCents: 5_000, issuedAt: "2027-03-09T08:00:00Z", status: "void" },
    ]);
    expect(pack.receipts).toEqual([{ charityName: "Northcliff Meals Fund", reference: "NMF-2027-0001", cents: 100_000, issuedAt: "2027-03-09T08:00:00Z" }]);
    expect(pack.lines.map((l) => l.dedication)).toEqual([null, "In memory of Chaim Cohen"]);
  });

  it("accepts only a sensible four-digit tax year", () => {
    expect(parseTaxYear("2027")).toBe(2027);
    for (const bad of ["27", "2027a", "1999", "9999", "", "20 27"]) expect(parseTaxYear(bad)).toBeNull();
  });
});

describe("what is actually on a receipt", () => {
  it("counts only donations on an issued receipt, apart from what was asked for", () => {
    const pack = buildTaxPack(2027, [row({ id: "on", amountCents: 50_000 }), row({ id: "late", amountCents: 20_000 }), row({ id: "none", wants18a: false, amountCents: 5_000 })], [], new Set(["on"]));
    expect(pack.s18aCents).toBe(70_000);
    expect(pack.receiptedCents).toBe(50_000);
    expect(pack.lines.find((l) => l.id === "late")).toMatchObject({ s18a: true, receipted: false });
  });
});
