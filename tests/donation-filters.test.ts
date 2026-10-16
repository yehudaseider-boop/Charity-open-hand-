import { describe, expect, it } from "vitest";
import { applyDonationFilters, filtersToQuery, parseDonationFilters, periodText } from "@/lib/charity/donation-filters";

const now = new Date("2026-10-16T08:00:00+02:00");

describe("donation filters", () => {
  it("turns each period into Johannesburg calendar days", () => {
    expect(parseDonationFilters({ period: "this-month" }, now)).toMatchObject({ fromDate: "2026-10-01", toDate: "2026-10-31" });
    expect(parseDonationFilters({ period: "last-month" }, now)).toMatchObject({ fromDate: "2026-09-01", toDate: "2026-09-30" });
    expect(parseDonationFilters({ period: "this-tax-year" }, now)).toMatchObject({ fromDate: "2026-03-01", toDate: "2027-02-28" });
    expect(parseDonationFilters({ period: "last-tax-year" }, now)).toMatchObject({ fromDate: "2025-03-01", toDate: "2026-02-28" });
    expect(parseDonationFilters({ period: "last-month" }, new Date("2026-01-10T08:00:00+02:00"))).toMatchObject({ fromDate: "2025-12-01", toDate: "2025-12-31" });
  });
  it("own dates: swapped if back to front, ignored if incomplete, used even if the period was left on Any time", () => {
    expect(parseDonationFilters({ period: "custom", from: "2026-10-10", to: "2026-10-01" }, now)).toMatchObject({ period: "custom", fromDate: "2026-10-01", toDate: "2026-10-10" });
    expect(parseDonationFilters({ period: "custom", from: "2026-10-10" }, now)).toMatchObject({ period: "all", fromDate: null });
    expect(parseDonationFilters({ from: "2026-10-01", to: "2026-10-05" }, now)).toMatchObject({ period: "custom", fromDate: "2026-10-01" });
  });
  it("ignores unknown statuses and periods", () => {
    expect(parseDonationFilters({ status: "pending-ish", period: "forever" }, now)).toMatchObject({ status: "all", period: "all" });
  });
  it("round-trips through the address, so the download matches the screen", () => {
    const f = parseDonationFilters({ status: "paid", q: "sarah.cohen@gmail.com", period: "custom", from: "2026-10-01", to: "2026-10-05" }, now);
    expect(parseDonationFilters(Object.fromEntries(new URLSearchParams(filtersToQuery(f))), now)).toEqual(f);
    expect(periodText(f)).toBe("01/10/2026 to 05/10/2026");
  });
  it("filters by when the payment went through, the last day included", () => {
    const calls: string[] = [];
    const q = { eq: (c: string, v: string) => (calls.push(`eq ${c} ${v}`), q), gte: (c: string, v: string) => (calls.push(`gte ${c} ${v}`), q), lt: (c: string, v: string) => (calls.push(`lt ${c} ${v}`), q), or: (v: string) => (calls.push(`or ${v}`), q) };
    applyDonationFilters(q, parseDonationFilters({ status: "paid", period: "custom", from: "2026-12-01", to: "2026-12-31" }, now));
    expect(calls).toEqual(["eq status paid", "gte paid_at 2026-12-01T00:00:00+02:00", "lt paid_at 2027-01-01T00:00:00+02:00"]);
  });
});
