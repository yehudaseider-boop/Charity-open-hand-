import { describe, expect, it } from "vitest";
import { cleanDonorSearch, donationFiltersQuery, parseDonationFilters } from "@/lib/charity/donation-filters";

describe("parseDonationFilters", () => {
  it("reads valid filters", () => {
    const f = parseDonationFilters({ status: "reversed", "18a": "yes", campaign: "none", from: "2026-10-01", to: "2026-10-31", page: "3" });
    expect(f).toEqual({
      status: "reversed",
      wants18a: true,
      campaign: "none",
      fromDate: "2026-10-01",
      from: "2026-10-01T00:00:00+02:00",
      toDate: "2026-10-31",
      toExclusive: "2026-11-01T00:00:00+02:00",
      page: 3,
    });
  });

  it("ignores anything malformed", () => {
    const f = parseDonationFilters({ status: "stolen", "18a": "maybe", campaign: "x'); drop", from: "2026-02-30", to: "31/10/2026", page: "-1" });
    expect(f).toEqual({ page: 1 });
  });

  it("includes the whole of the last day, across a year end", () => {
    expect(parseDonationFilters({ to: "2026-12-31" }).toExclusive).toBe("2027-01-01T00:00:00+02:00");
  });
});

describe("donationFiltersQuery", () => {
  it("round-trips and never carries a search", () => {
    const f = parseDonationFilters({ status: "paid", "18a": "no", from: "2026-03-01" });
    expect(donationFiltersQuery(f, 2)).toBe("?status=paid&18a=no&from=2026-03-01&page=2");
    expect(donationFiltersQuery({ page: 1 })).toBe("");
  });
});

describe("cleanDonorSearch", () => {
  it("keeps names and emails", () => {
    expect(cleanDonorSearch("  dina.donor@openhand.test ")).toBe("dina.donor@openhand.test");
    expect(cleanDonorSearch("Test Trading")).toBe("Test Trading");
  });
  it("drops characters that have meaning in the database filter", () => {
    expect(cleanDonorSearch("a,b(c)*d%e\"f'g\\h:i")).toBe("a b c d e f g h i");
  });
  it("is kept short and ignores non-text", () => {
    expect(cleanDonorSearch("x".repeat(200))).toHaveLength(80);
    expect(cleanDonorSearch(undefined)).toBe("");
  });
});
