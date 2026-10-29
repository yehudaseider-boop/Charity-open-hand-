import { describe, expect, it } from "vitest";
import { demoData, donorFacts, DEMO_DONOR_COUNT } from "@/app/demo/dashboard/data";
import { demoOverview, monthOf } from "@/app/demo/dashboard/sample";
import { taxYearRange } from "@/lib/dates";

describe("the public dashboard demo", () => {
  const now = new Date("2026-10-29T08:00:00Z");
  const data = demoData(now);
  const o = demoOverview(now, data);
  const paid = data.gifts.filter((g) => g.status === "paid");
  const sum = (gs: { amountCents: number }[]) => gs.reduce((t, g) => t + g.amountCents, 0);

  it("is the same on every visit, and only ever made-up people", () => {
    expect(demoData(now).gifts.map((g) => [g.id, g.amountCents])).toEqual(data.gifts.map((g) => [g.id, g.amountCents]));
    expect(data.donors).toHaveLength(DEMO_DONOR_COUNT);
    expect(data.donors.every((d) => ["Example", "Sample", "Demo", "Placeholder", "Specimen", "Mock", "Testcase"].includes(d.last))).toBe(true);
    expect(data.donors.every((d) => d.email.endsWith("@example.test"))).toBe(true);
  });

  it("ends on this month, with nothing dated after today", () => {
    expect(o.chart).toHaveLength(12);
    expect(o.chart[11].month).toBe("2026-10-01");
    expect(data.gifts.every((g) => g.paidAt <= now.toISOString())).toBe(true);
    expect(demoData(new Date("2027-03-02T08:00:00Z")).months[11]).toBe("2027-03");
  });

  it("never shows a gift later than now, whatever the time of day, and keeps each in its month", () => {
    // Early morning on the 1st (Johannesburg), early morning mid-month, late evening, and the last minute of a month.
    for (const iso of ["2026-09-30T22:05:00Z", "2026-10-01T03:00:00Z", "2026-11-03T03:00:00Z", "2026-10-29T19:30:00Z", "2026-10-31T21:59:00Z"]) {
      const at = new Date(iso);
      const d = demoData(at);
      expect(d.gifts.every((g) => g.paidAt <= at.toISOString()), iso).toBe(true);
      expect(d.gifts.every((g) => d.months.includes(monthOf(g.paidAt))), iso).toBe(true);
    }
  });

  it("agrees with itself: chart, this month, the tax year, sources and donors come from the same gifts", () => {
    expect(o.chart.reduce((t, m) => t + m.amountCents, 0)).toBe(sum(paid));
    expect(o.month.paid_cents).toBe(sum(paid.filter((g) => monthOf(g.paidAt) === "2026-10")));
    const { start } = taxYearRange(o.taxYear.taxYear);
    const inYear = paid.filter((g) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date(g.paidAt)) >= start);
    expect(o.year.paid_cents).toBe(sum(inYear));
    expect(o.sources).toHaveLength(inYear.length);
    expect(o.donorCount).toBe(donorFacts(data).length);
    expect(o.top.every((t) => data.donor(t.donor_id))).toBe(true);
  });

  it("has monthly donations that add up and two being retried", () => {
    expect(o.regular.runningCount).toBe(14);
    expect(o.regular.runningCentsPerMonth).toBe(420_000);
    expect(data.monthly.filter((m) => m.retrying)).toHaveLength(2);
    for (const m of data.monthly) expect(m.paid_cents).toBe(sum(data.gifts.filter((g) => g.recurringId === m.recurring_id)));
  });

  it("keeps every link inside the demo", () => {
    expect(o.base).toBe("/demo/dashboard");
    expect(o.todo.every((t) => t.href.startsWith("/demo/dashboard"))).toBe(true);
    expect(o.recent.every((r) => data.gifts.some((g) => g.id === r.id))).toBe(true);
  });
});
