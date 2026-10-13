import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const s = await import("@/lib/donations/schedule");

describe("months and collection times", () => {
  it("names the month in Johannesburg time, not UTC", () => {
    expect(s.periodOf(new Date("2026-10-31T21:59:59Z"))).toBe("2026-10"); // 23:59 on the 31st in SA
    expect(s.periodOf(new Date("2026-10-31T22:00:00Z"))).toBe("2026-11"); // 00:00 on 1 November in SA
    expect(s.chargeDayOf(new Date("2026-10-31T22:00:00Z"))).toBe(1);
  });

  it("adds months across year ends", () => {
    expect(s.addMonths("2026-10", 1)).toBe("2026-11");
    expect(s.addMonths("2026-12", 1)).toBe("2027-01");
    expect(s.addMonths("2027-01", -1)).toBe("2026-12");
    expect(s.addMonths("2026-01", 25)).toBe("2028-02");
  });

  it("knows month lengths, including leap years", () => {
    expect(s.daysInMonth("2027-02")).toBe(28);
    expect(s.daysInMonth("2028-02")).toBe(29);
    expect(s.daysInMonth("2026-04")).toBe(30);
    expect(s.daysInMonth("2026-12")).toBe(31);
  });

  it("collects at 08:00 Johannesburg time (06:00 UTC) on the charge day", () => {
    expect(s.chargeTime("2026-11", 15).toISOString()).toBe("2026-11-15T06:00:00.000Z");
  });

  it("days 29 to 31 fall on the last day of a shorter month", () => {
    expect(s.chargeTime("2027-02", 31).toISOString()).toBe("2027-02-28T06:00:00.000Z");
    expect(s.chargeTime("2028-02", 30).toISOString()).toBe("2028-02-29T06:00:00.000Z");
    expect(s.chargeTime("2026-04", 31).toISOString()).toBe("2026-04-30T06:00:00.000Z");
    expect(s.chargeTime("2026-05", 31).toISOString()).toBe("2026-05-31T06:00:00.000Z");
  });
});

describe("retries", () => {
  const now = new Date("2026-11-15T06:00:00Z");
  it("tries again after a day, then after three days, then stops", () => {
    expect(s.retryTime(now, 1)?.toISOString()).toBe("2026-11-16T06:00:00.000Z");
    expect(s.retryTime(now, 2)?.toISOString()).toBe("2026-11-18T06:00:00.000Z");
    expect(s.retryTime(now, s.MAX_ATTEMPTS)).toBeNull();
  });
});

describe("attempt ids", () => {
  const id = (r: string, p: string, a: number) => s.attemptDonationId(r, p, a);
  it("is a UUID the rest of the system accepts", () => {
    expect(id("r1", "2026-11", 0)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it("is the same for the same attempt, so a repeated run cannot charge twice", () => {
    expect(id("r1", "2026-11", 0)).toBe(id("r1", "2026-11", 0));
  });
  it("differs by donation, month and attempt", () => {
    const all = new Set([id("r1", "2026-11", 0), id("r2", "2026-11", 0), id("r1", "2026-12", 0), id("r1", "2026-11", 1)]);
    expect(all.size).toBe(4);
  });
});
