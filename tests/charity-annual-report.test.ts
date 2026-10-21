/** The annual report: one tax year's figures, with refunds kept apart and new donors told from returning ones. */
import { describe, expect, it } from "vitest";
import { annualReport, reportYears, taxYearMonths, type ReportGift } from "@/lib/charity/annual-report";

let n = 0;
const gift = (donor: string, cents: number, paidAt: string, over: Partial<ReportGift> = {}): ReportGift => ({
  id: `g${++n}`, donor_id: donor, status: "paid", amount_cents: cents, paid_at: paidAt, tax_year: null, recurring_id: null, campaign_id: null, wants_18a: false, ...over,
});
const now = new Date("2026-10-18T10:00:00Z"); // tax year 2027 is running

describe("annual report", () => {
  const gifts = [
    gift("old", 50_000, "2025-06-01T10:00:00Z"), // tax year 2026
    gift("old", 18_000, "2026-03-01T08:00:00Z", { recurring_id: "r1", wants_18a: true }), // 2027, monthly
    gift("old", 18_000, "2026-04-01T08:00:00Z", { recurring_id: "r1", wants_18a: true }),
    gift("new", 100_000, "2026-04-20T09:00:00Z", { campaign_id: "c1" }),
    gift("new", 25_000, "2026-05-02T09:00:00Z", { status: "refunded" }),
    gift("late", 30_000, "2026-02-28T21:30:00Z"), // 23:30 in Johannesburg on 28/02: still tax year 2026
  ];
  const r = annualReport(gifts, 2027, new Map([["c1", "Winter blankets"]]), new Set(), now);

  it("adds up paid donations only, and keeps refunds apart", () => {
    expect(r.totalCents).toBe(136_000);
    expect(r.donationCount).toBe(3);
    expect(r.averageCents).toBe(45_333);
    expect(r.refunded).toEqual({ count: 1, cents: 25_000 });
  });
  it("tells new donors from those who gave in an earlier year", () => {
    expect(r.donors).toBe(2);
    expect(r.newDonors).toBe(1);
    expect(r.returningDonors).toBe(1);
  });
  it("a refunded first gift doesn't make someone a returning donor (same rule as the Overview)", () => {
    const rows = [gift("x", 50_000, "2025-06-01T10:00:00Z", { status: "refunded" }), gift("x", 20_000, "2026-04-05T10:00:00Z")];
    const rep = annualReport(rows, 2027, new Map(), new Set(), now);
    expect(rep.newDonors).toBe(1);
    expect(rep.returningDonors).toBe(0);
  });
  it("splits monthly and once-off, finds the best month and lists campaigns", () => {
    expect(r.monthlyCents).toBe(36_000);
    expect(r.onceOffCents).toBe(100_000);
    expect(r.months).toHaveLength(12);
    expect(r.months[0]).toMatchObject({ month: "2026-03", cents: 18_000, count: 1 });
    expect(r.bestMonth).toMatchObject({ month: "2026-04", cents: 118_000, count: 2 });
    expect(r.campaigns).toEqual([{ id: "c1", title: "Winter blankets", cents: 100_000, count: 1 }]);
  });
  it("counts s18A requests per donor and what still needs a receipt", () => {
    expect(r.s18a).toEqual({ donors: 1, receipted: 0, waitingCents: 36_000 });
    const done = annualReport(gifts, 2027, new Map(), new Set(gifts.filter((g) => g.wants_18a).map((g) => g.id)), now);
    expect(done.s18a).toEqual({ donors: 1, receipted: 1, waitingCents: 0 });
  });
  it("knows a running year from a finished one, and uses Johannesburg dates at the year's edge", () => {
    expect(r.running).toBe(true);
    const last = annualReport(gifts, 2026, new Map(), new Set(), now);
    expect(last.running).toBe(false);
    expect(last.totalCents).toBe(80_000);
    expect(last.months[11]).toMatchObject({ month: "2026-02", cents: 30_000 });
  });
  it("offers every year with donations, newest first, always with the current one", () => {
    expect(reportYears(gifts, now)).toEqual([2027, 2026]);
    expect(reportYears([], now)).toEqual([2027]);
    expect(taxYearMonths(2027).map((m) => m.month)).toEqual(["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]);
  });
});
