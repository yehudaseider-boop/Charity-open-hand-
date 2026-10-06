import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, taxYearFor, taxYearLabel, taxYearRange } from "@/lib/dates";

describe("formatDate", () => {
  it("uses dd/mm/yyyy", () => {
    expect(formatDate("2026-10-06T10:00:00Z")).toBe("06/10/2026");
  });
  it("uses Johannesburg time, not UTC", () => {
    // 23:30 UTC on 28 Feb is 01:30 on 1 March in Johannesburg (UTC+2).
    expect(formatDate("2026-02-28T23:30:00Z")).toBe("01/03/2026");
    expect(formatDateTime("2026-02-28T23:30:00Z")).toBe("01/03/2026 01:30");
  });
});

describe("taxYearFor (SARS: named by end year, 1 March to end Feb)", () => {
  it.each([
    ["2026-03-01T00:00:00+02:00", 2027],
    ["2026-10-06T12:00:00+02:00", 2027],
    ["2027-02-28T23:59:59+02:00", 2027],
    ["2027-03-01T00:00:00+02:00", 2028],
    ["2026-02-28T12:00:00+02:00", 2026],
  ])("%s -> %i", (date, year) => {
    expect(taxYearFor(date)).toBe(year);
  });
  it("uses SA time at the boundary", () => {
    // 22:30 UTC on 28 Feb 2027 is already 1 March in Johannesburg.
    expect(taxYearFor("2027-02-28T22:30:00Z")).toBe(2028);
  });
});

describe("taxYearRange", () => {
  it("handles normal and leap years", () => {
    expect(taxYearRange(2027)).toEqual({ start: "2026-03-01", end: "2027-02-28" });
    expect(taxYearRange(2028)).toEqual({ start: "2027-03-01", end: "2028-02-29" });
  });
  it("labels", () => {
    expect(taxYearLabel(2027)).toBe("Tax year 2027 (01/03/2026 to 28/02/2027)");
  });
});
