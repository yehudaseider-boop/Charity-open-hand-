/** The phone app's pure helpers (apps/mobile/src/lib). */
import { describe, expect, it } from "vitest";
import { donateUrl } from "../apps/mobile/src/lib/website";
import { rand, ddmmyyyy } from "../apps/mobile/src/lib/format";
import { taxYearFor, taxYearRangeLabel } from "../apps/mobile/src/lib/tax-year";

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

import { groupByMonth, maaserTargetCents, taxYearsGiven, totalInTaxYear } from "../apps/mobile/src/lib/giving";

describe("app giving helpers", () => {
  const rows = [
    { date: new Date(2026, 1, 28), cents: 100 }, // tax year 2026
    { date: new Date(2026, 2, 1), cents: 200 }, // tax year 2027
    { date: new Date(2026, 9, 2), cents: 300 }, // tax year 2027
  ];
  it("sums by SARS tax year", () => {
    expect(totalInTaxYear(rows, 2027)).toBe(500);
    expect(totalInTaxYear(rows, 2026)).toBe(100);
  });
  it("groups by month, newest first", () => {
    expect(groupByMonth(rows).map((g) => g.label)).toEqual(["October 2026", "March 2026", "February 2026"]);
  });
  it("maaser target is the percentage of income", () => {
    expect(maaserTargetCents(4_800_000, 100_000)).toBe(480_000); // 10% of R48 000
    expect(maaserTargetCents(4_800_000, 200_000)).toBe(960_000); // 20% (chomesh)
  });
});

describe("app hand-off to the website", () => {
  it("opens the charity's donation page with the donor's label carried over", () => {
    expect(donateUrl("https://example.co.za", "northcliff-meals-fund", "Work giving")).toBe(
      "https://example.co.za/c/northcliff-meals-fund/donate?label=Work%20giving&from=app",
    );
    expect(donateUrl("https://example.co.za/", "a b", "Maaser")).toBe("https://example.co.za/c/a%20b/donate?label=Maaser&from=app");
  });
  it("carries a campaign over, and no label when none was chosen", () => {
    expect(donateUrl("https://example.co.za", "a", null, "c0ffee00-0000-4000-8000-000000000001")).toBe(
      "https://example.co.za/c/a/donate?campaign=c0ffee00-0000-4000-8000-000000000001&from=app",
    );
  });
  it("refuses a website address that isn't https", () => {
    expect(donateUrl("http://example.co.za", "x", "tzedaka")).toBeNull();
    expect(donateUrl("", "x", "tzedaka")).toBeNull();
    expect(donateUrl(undefined, "x", "tzedaka")).toBeNull();
  });
});

describe("app giving: tax years given", () => {
  it("lists the tax years with gifts, newest first, always with the current one", () => {
    const rows = [
      { date: new Date(2025, 1, 28) }, // 28/02/2025: tax year 2025
      { date: new Date(2025, 2, 1) }, // 01/03/2025: tax year 2026
      { date: new Date(2025, 5, 10) },
    ];
    expect(taxYearsGiven(rows, 2027)).toEqual([2027, 2026, 2025]);
    expect(taxYearsGiven([], 2027)).toEqual([2027]);
  });
});
