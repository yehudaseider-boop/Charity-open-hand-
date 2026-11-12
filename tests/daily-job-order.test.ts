/**
 * The daily job (review of 12/11/2026): the safety-net checks and the team's email always run before the payment
 * provider's payouts, which have their own time budget and their own short email when they ran out or failed. And
 * the monthly runs' "counted without a decline" tries are added up across runs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const steps: string[] = [];
let payoutsResult: unknown;
let payoutsOpts: { deadline?: number } | undefined;
vi.mock("@/lib/donations/monthly-store", () => ({ runMonthlyGiving: async () => (steps.push("monthly"), { considered: 0, paid: 0, failed: 0, stopped: 0, waiting: [], alreadyPaid: 0, review: [], errors: [] }) }));
vi.mock("@/lib/donations/payouts", () => ({
  syncPayouts: async (_now: Date, opts?: { deadline?: number }) => {
    steps.push("payouts");
    payoutsOpts = opts;
    if (payoutsResult instanceof Error) throw payoutsResult;
    return payoutsResult;
  },
}));
vi.mock("@/lib/charity/journey-store", () => ({ runJourneys: async () => (steps.push("journeys"), { sent: 0 }) }));
vi.mock("@/lib/ops/alert", () => ({
  cronAllowed: () => true,
  alertGivezy: async (subject: string) => (steps.push(`alert: ${subject}`), "sent"),
}));
vi.mock("@/lib/ops/daily", async (orig) => {
  const real = await orig<typeof import("@/lib/ops/daily")>();
  return {
    ...real,
    runDailyChecks: async () => (
      steps.push("checks"),
      { incomplete: false, cardUpdatesFinished: 0, pending: { checked: 0, paid: 0, failed: 0, still: 0, errors: 0 }, stuckPending: 1, confirmations: { resent: 0, failedAgain: 0 }, unhandledEvents: 0, held: {} }
    ),
  };
});

const { GET } = await import("@/app/api/jobs/daily/route");
const { collectMonthlyWithin, dailyDigest, payoutsAlertLines } = await import("@/lib/ops/daily");
const call = () => GET(new Request("https://x.test/api/jobs/daily") as never);

beforeEach(() => {
  steps.length = 0;
  payoutsResult = { charities: 2, payouts: 3, lines: 9, unmatched: 0, failed: [] };
  payoutsOpts = undefined;
});

describe("the daily job's order", () => {
  it("checks and emails the team before reading payouts, and gives the payouts a deadline", async () => {
    const before = Date.now();
    await call();
    expect(steps.slice(0, 4)).toEqual(["monthly", "checks", "alert: 1 thing needs a person today", "payouts"]);
    expect(payoutsOpts?.deadline).toBeGreaterThan(before);
    expect(payoutsOpts!.deadline! - before).toBeLessThanOrEqual(46_000 + 1_000);
    expect(steps.some((s) => s.startsWith("alert: the deposit report"))).toBe(false);
  });

  it("payouts that ran out of time or failed get their own short email after the main one", async () => {
    payoutsResult = { charities: 1, payouts: 1, lines: 2, unmatched: 0, failed: [], outOfTime: true, notReached: 4 };
    await call();
    expect(steps.at(-1)).toBe("alert: the deposit report wasn't fully updated today");
    steps.length = 0;
    payoutsResult = new Error("provider down");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call();
    expect(res.status).toBe(200);
    expect(steps.indexOf("alert: 1 thing needs a person today")).toBeLessThan(steps.indexOf("payouts"));
    expect(steps.at(-1)).toBe("alert: the deposit report wasn't fully updated today");
  });
});

describe("the deposit report's own email", () => {
  it("says nothing when it ran in full", () => {
    expect(payoutsAlertLines({ charities: 3, payouts: 1, lines: 1, unmatched: 0, failed: [] })).toEqual([]);
  });
  it("says it ran out of time, how many charities were not reached, and that it carries on tomorrow", () => {
    expect(payoutsAlertLines({ charities: 3, payouts: 1, lines: 1, unmatched: 0, failed: [], outOfTime: true, notReached: 2 })).toEqual([
      "The deposit report ran out of time today with 2 charities not reached. What was read in full is kept; the rest is read tomorrow.",
    ]);
  });
  it("names failures and a run with no time left at all", () => {
    expect(payoutsAlertLines({ charities: 3, payouts: 1, lines: 1, unmatched: 0, failed: [{ charityId: "c", message: "x" }] })[0]).toMatch(/could not be read for 1 charity/);
    expect(payoutsAlertLines(null)[0]).toMatch(/could not be updated today/);
    expect(payoutsAlertLines(null, { started: false })[0]).toMatch(/had no time left/);
  });
});

describe("monthly runs added up", () => {
  it("keeps every run's tries that were counted without a decline", async () => {
    let n = 0;
    const total = await collectMonthlyWithin(async () => {
      n += 1;
      return n === 1
        ? { considered: 1, paid: 0, failed: 1, stopped: 0, waiting: [], alreadyPaid: 0, review: [], unconfirmed: [{ id: "r1", donationId: "d1", why: "closed_unpaid" as const }], errors: [] }
        : { considered: 0, paid: 0, failed: 0, stopped: 0, waiting: [], alreadyPaid: 0, review: [], errors: [] };
    }, 30_000);
    expect(total.unconfirmed).toEqual([{ id: "r1", donationId: "d1", why: "closed_unpaid" }]);
  });
});

describe("monthly donations held for the payment provider, in the daily email", () => {
  const quiet = { incomplete: false, cardUpdatesFinished: 0, pending: { checked: 0, paid: 0, failed: 0, still: 0, errors: 0 }, stuckPending: 0, confirmations: { resent: 0, failedAgain: 0 }, unhandledEvents: 0, held: {} };
  const fine = { monthlyErrors: 0, monthlyReview: 0, monthlyStopped: 0, payoutsFailed: false, monthlyFailed: false };

  it("names the amount and the charity, and says nothing more is charged, once a line each, every day", () => {
    const lines = dailyDigest({ ...quiet, held: { "monthly.waiting_on_provider": 1 } }, { ...fine, monthlyWaitingOnProvider: [{ totalCents: 20_000, charityName: "Meals Fund" }] });
    expect(lines).toEqual(["Monthly collection: still waiting for the payment provider about R200 for Meals Fund. Nothing more will be charged until it's settled."]);
  });

  it("a month paid twice is a line for a person", () => {
    expect(dailyDigest({ ...quiet, held: { "monthly.paid_twice": 1 } }, fine)).toEqual(["A monthly donation was paid twice for one month: refund one of the two payments: 1"]);
  });
});
