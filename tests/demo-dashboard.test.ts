import { describe, expect, it } from "vitest";
import { demoOverview, share } from "@/app/demo/dashboard/sample";
import { taxYearRange } from "@/lib/dates";

describe("the public dashboard demo", () => {
  const now = new Date("2026-10-29T08:00:00Z");
  const d = demoOverview(now);

  it("shares a total out in whole numbers that add up exactly", () => {
    expect(share(204, [52, 38, 33, 29, 21, 17, 14])).toEqual(expect.any(Array));
    expect(share(204, [52, 38, 33, 29, 21, 17, 14]).reduce((a, b) => a + b, 0)).toBe(204);
    expect(share(0, [1, 2]).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("ends its chart on this month, so it always looks current", () => {
    expect(d.chart).toHaveLength(12);
    expect(d.chart[11].month).toBe("2026-10-01");
    expect(demoOverview(new Date("2027-03-02T08:00:00Z")).chart[11].month).toBe("2027-03-01");
  });

  it("has figures that agree with each other: this month, the tax year and where gifts came from", () => {
    expect(d.month.paid_cents).toBe(d.chart[11].amountCents);
    const start = taxYearRange(d.taxYear.taxYear).start.slice(0, 7);
    const inYear = d.chart.filter((m) => m.month.slice(0, 7) >= start);
    expect(d.year.paid_cents).toBe(inYear.reduce((t, m) => t + m.amountCents, 0));
    expect(d.sources).toHaveLength(d.year.paid_count);
  });

  it("uses only made-up people and stays on its own pages", () => {
    const names = d.recent.map((r) => r.last_name);
    expect(names.every((n) => ["Example", "Sample", "Demo", "Placeholder", "Specimen", "Mock", "Testcase"].includes(n ?? ""))).toBe(true);
    expect(d.recent.every((r) => r.email?.endsWith("@example.test"))).toBe(true);
    expect(d.base).toBe("/demo/dashboard");
    expect(d.todo.every((t) => t.href.startsWith("/demo/dashboard"))).toBe(true);
  });
});
