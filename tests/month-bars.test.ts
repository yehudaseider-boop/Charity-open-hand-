import { describe, expect, it } from "vitest";
import { monthDonationsHref } from "@/app/charity-admin/[id]/month-bars";
import { parseDonationFilters } from "@/lib/charity/donation-filters";

describe("tapping a month on the overview chart", () => {
  it("opens that month's paid donations, the whole month", () => {
    const href = monthDonationsHref("/charity-admin/c1/donations", "2026-02-01");
    expect(href).toBe("/charity-admin/c1/donations?status=paid&period=custom&from=2026-02-01&to=2026-02-28");
    const f = parseDonationFilters(Object.fromEntries(new URL(href, "https://x.test").searchParams));
    expect(f).toMatchObject({ status: "paid", period: "custom", fromDate: "2026-02-01", toDate: "2026-02-28" });
  });
  it("knows the length of each month, leap years included", () => {
    expect(monthDonationsHref("/d", "2028-02-01")).toContain("to=2028-02-29");
    expect(monthDonationsHref("/d", "2026-12-01")).toContain("to=2026-12-31");
  });
});
