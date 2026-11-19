/** The daily job checks in once, last, and only when its main work ran (19/11/2026). */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const steps: string[] = [];
let monthlyFails = false;
let checksFail = false;
vi.mock("@/lib/donations/monthly-store", () => ({
  runMonthlyGiving: async () => {
    if (monthlyFails) throw new Error("boom");
    return { considered: 0, paid: 0, failed: 0, stopped: 0, waiting: [], alreadyPaid: 0, review: [], errors: [] };
  },
}));
vi.mock("@/lib/donations/payouts", () => ({ syncPayouts: async () => (steps.push("payouts"), { charities: 0, payouts: 0, lines: 0, unmatched: 0, failed: [] }) }));
vi.mock("@/lib/charity/journey-store", () => ({ runJourneys: async () => (steps.push("journeys"), { sent: 0 }) }));
vi.mock("@/lib/ops/alert", () => ({ cronAllowed: () => true, alertGivezy: async () => "sent" }));
vi.mock("@/lib/ops/heartbeat", () => ({ pingHeartbeat: async () => (steps.push("heartbeat"), "sent") }));
vi.mock("@/lib/ops/daily", async (orig) => {
  const real = await orig<typeof import("@/lib/ops/daily")>();
  return {
    ...real,
    runImportantEmailRetries: async () => ({ incomplete: false, confirmations: { resent: 0, failedAgain: 0 } }),
    runDailyChecks: async () => {
      if (checksFail) throw new Error("checks down");
      return { incomplete: false, cardUpdatesFinished: 0, pending: { checked: 0, paid: 0, failed: 0, still: 0, errors: 0 }, stuckPending: 0, confirmations: { resent: 0, failedAgain: 0 }, unhandledEvents: 0, held: {} };
    },
  };
});

const { GET } = await import("@/app/api/jobs/daily/route");
const call = () => GET(new Request("https://x.test/api/jobs/daily") as never);

beforeEach(() => {
  steps.length = 0;
  monthlyFails = false;
  checksFail = false;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("the daily job's check-in", () => {
  it("checks in once, after the payouts and the journeys, when the day's work ran", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(steps.filter((s) => s === "heartbeat")).toHaveLength(1);
    expect(steps.at(-1)).toBe("heartbeat");
    expect(steps.indexOf("heartbeat")).toBeGreaterThan(steps.indexOf("payouts"));
    expect(steps.indexOf("heartbeat")).toBeGreaterThan(steps.indexOf("journeys"));
  });

  it("does not check in when the monthly collection failed: the monitoring service notices the silence", async () => {
    monthlyFails = true;
    await call();
    expect(steps).not.toContain("heartbeat");
  });

  it("does not check in when the safety checks could not run", async () => {
    checksFail = true;
    const res = await call();
    expect(res.status).toBe(500);
    expect(steps).not.toContain("heartbeat");
  });
});
