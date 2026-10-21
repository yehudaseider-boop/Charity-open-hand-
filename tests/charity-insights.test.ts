import { describe, expect, it } from "vitest";
import { countDonorGroups, donorGroup, endsWithinAWeek, lastMonths, monthlyAttention, topDonors } from "@/lib/charity/insights";
import { lastMonth } from "@/lib/charity/dashboard";

const now = new Date("2026-10-16T10:00:00+02:00");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const donor = (count: number, firstDays: number, lastDays: number, total = 1000) => ({
  donation_count: count, first_paid_at: daysAgo(firstDays), last_paid_at: daysAgo(lastDays), total_cents: total,
});

describe("donor groups", () => {
  it("puts each donor in exactly one group", () => {
    expect(donorGroup(donor(1, 3, 3), now)).toBe("new");
    expect(donorGroup(donor(3, 10, 2), now)).toBe("new"); // first gift still recent
    expect(donorGroup(donor(2, 90, 5), now)).toBe("repeat");
    expect(donorGroup(donor(1, 60, 60), now)).toBe("once");
    expect(donorGroup(donor(5, 400, 200), now)).toBe("lapsed");
  });
  it("uses 30 and 180 days as the edges", () => {
    expect(donorGroup(donor(1, 30, 30), now)).toBe("new");
    expect(donorGroup(donor(1, 31, 31), now)).toBe("once");
    expect(donorGroup(donor(2, 300, 180), now)).toBe("repeat");
    expect(donorGroup(donor(2, 300, 181), now)).toBe("lapsed");
  });
  it("counts them", () => {
    expect(countDonorGroups([donor(1, 1, 1), donor(1, 1, 1), donor(1, 300, 300)], now)).toEqual({ new: 2, repeat: 0, once: 0, lapsed: 1 });
  });
});

describe("top donors", () => {
  it("sorts by total, then gifts", () => {
    const a = { ...donor(1, 5, 5, 5000), id: "a" }, b = { ...donor(4, 5, 5, 5000), id: "b" }, c = { ...donor(1, 5, 5, 9000), id: "c" };
    expect(topDonors([a, b, c], 2).map((d) => d.id)).toEqual(["c", "b"]);
  });
});

describe("monthly donations needing attention", () => {
  const row = (status: "active" | "paused" | "failed" | "cancelled", o: Partial<{ retrying: boolean; paused_at: string; ended_at: string; amount_cents: number }> = {}) => ({
    status, retrying: false, paused_at: null, ended_at: null, amount_cents: 10_000, ...o,
  });
  it("counts declined, recently paused and recently ended", () => {
    const r = monthlyAttention([
      row("active", { retrying: true }), row("active"),
      row("paused", { paused_at: daysAgo(3) }), row("paused", { paused_at: daysAgo(90) }),
      row("cancelled", { ended_at: daysAgo(10), amount_cents: 25_000 }), row("failed", { ended_at: daysAgo(40) }),
    ], now);
    expect(r).toEqual({ retrying: 1, pausedRecently: 1, endedRecently: 1, endedRecentlyCents: 25_000 });
  });
});

describe("campaign ending soon", () => {
  it("is within the next seven days only", () => {
    expect(endsWithinAWeek("2026-10-20T23:59:59+02:00", now)).toBe(true);
    expect(endsWithinAWeek("2026-10-30T23:59:59+02:00", now)).toBe(false);
    expect(endsWithinAWeek("2026-10-10T23:59:59+02:00", now)).toBe(false);
    expect(endsWithinAWeek(null, now)).toBe(false);
  });
});

describe("last 12 months", () => {
  it("fills empty months with zero, oldest first, across the year end", () => {
    const m = lastMonths([{ month: "2026-01-01", donationCount: 2, amountCents: 500, monthlyCents: 100 }], "2026-03-05", 4);
    expect(m.map((x) => x.month)).toEqual(["2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01"]);
    expect(m.map((x) => x.amountCents)).toEqual([0, 500, 0, 0]);
  });
  it("last month in Johannesburg time", () => {
    expect(lastMonth(new Date("2026-01-01T00:30:00+02:00"))).toEqual({ from: "2025-12-01T00:00:00+02:00", to: "2026-01-01T00:00:00+02:00" });
  });
});
