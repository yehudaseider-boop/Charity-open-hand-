import { describe, expect, it } from "vitest";
import { countDonorGroups, donorGroup, endsWithinAWeek, giftsPerDonor, lastMonths, monthlyAttention, monthlyTrend, topDonors } from "@/lib/charity/insights";
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

describe("monthly giving trend", () => {
  const row = (status: "active" | "paused" | "failed" | "cancelled", started: string, extra: { paused?: string; ended?: string; cents?: number } = {}) => ({
    status, amount_cents: extra.cents ?? 10_000, started_at: started, paused_at: extra.paused ?? null, ended_at: extra.ended ?? null,
  });
  const trend = (rows: ReturnType<typeof row>[]) => monthlyTrend(rows, "2026-10-16", now, 3);

  it("covers the last months, oldest first, with empty months as zero", () => {
    expect(trend([]).map((p) => [p.month, p.running, p.runningCents])).toEqual([["2026-08-01", 0, 0], ["2026-09-01", 0, 0], ["2026-10-01", 0, 0]]);
  });
  it("counts who was giving at the end of each month and who joined", () => {
    const t = trend([row("active", "2026-08-10T10:00:00+02:00"), row("active", "2026-09-20T10:00:00+02:00", { cents: 25_000 })]);
    expect(t.map((p) => [p.running, p.runningCents, p.started])).toEqual([[1, 10_000, 1], [2, 35_000, 1], [2, 35_000, 0]]);
  });
  it("counts a stopped or cancelled donor as stopped in that month and gone after it", () => {
    const t = trend([row("cancelled", "2026-07-01T10:00:00+02:00", { ended: "2026-09-05T10:00:00+02:00" })]);
    expect(t.map((p) => [p.running, p.stopped])).toEqual([[1, 0], [0, 1], [0, 0]]);
  });
  it("counts a paused donor as paused from the day they paused", () => {
    const t = trend([row("paused", "2026-07-01T10:00:00+02:00", { paused: "2026-10-02T10:00:00+02:00" })]);
    expect(t.map((p) => p.running)).toEqual([1, 1, 0]);
  });
  it("counts this month up to today, so a donor starting later this month isn't counted yet", () => {
    expect(trend([row("active", "2026-10-20T10:00:00+02:00")]).map((p) => p.running)).toEqual([0, 0, 0]);
  });
  it("uses Johannesburg months at the edge", () => {
    // 23:30 UTC on 30/09 is 01:30 on 01/10 in Johannesburg.
    expect(trend([row("active", "2026-09-30T23:30:00Z")]).map((p) => p.started)).toEqual([0, 0, 1]);
  });
});

describe("gifts per donor", () => {
  it("rounds half up to one decimal with whole numbers", () => {
    expect(giftsPerDonor(7, 3)).toBe("2.3");
    expect(giftsPerDonor(5, 2)).toBe("2.5");
    expect(giftsPerDonor(1, 3)).toBe("0.3");
    expect(giftsPerDonor(2, 3)).toBe("0.7");
    expect(giftsPerDonor(10, 1)).toBe("10.0");
  });
  it("is null with no donors", () => {
    expect(giftsPerDonor(0, 0)).toBeNull();
  });
});

describe("monthly giving trend without dates", () => {
  it("doesn't count a paused or stopped donor as giving today, even with no date recorded", () => {
    const rows = [
      { status: "paused" as const, amount_cents: 10_000, started_at: "2026-07-01T10:00:00+02:00", paused_at: null, ended_at: null },
      { status: "cancelled" as const, amount_cents: 10_000, started_at: "2026-07-01T10:00:00+02:00", paused_at: null, ended_at: null },
    ];
    const t = monthlyTrend(rows, "2026-10-16", now, 3);
    expect(t.map((p) => p.running)).toEqual([2, 2, 0]);
    expect(t.map((p) => p.stopped)).toEqual([0, 0, 0]);
  });
});
