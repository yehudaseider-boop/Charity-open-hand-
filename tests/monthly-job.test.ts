import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { runMonthlyCharges } = await import("@/lib/donations/monthly-job");
const { attemptDonationId, chargeTime } = await import("@/lib/donations/schedule");
import type { DueMonthly, MonthlyDeps, MonthlyStore } from "@/lib/donations/monthly-job";
import type { ConfirmOutcome } from "@/lib/donations/confirm";

const NOW = new Date("2026-11-15T06:30:00Z"); // 08:30 in Johannesburg, 15 November
const row = (o: Partial<DueMonthly> = {}): DueMonthly => ({
  id: "rec1", charitySlug: "meals", charityName: "Meals Fund", amountCents: 18_000, contributionCents: 2_000, chargeDay: 15,
  authorizationCode: "AUTH_x", email: "d@example.co.za", cardLast4: "4081", lastPaidPeriod: "2026-10", attemptPeriod: null, failedAttempts: 0,
  nextChargeAt: new Date("2026-11-15T06:00:00Z"), ...o,
});

type World = {
  due: DueMonthly[];
  attempts: Map<string, string>; // donationId -> status
  active: boolean;
  born: Date;
  claimed: Set<string>;
  paid: { id: string; period: string; next: string }[];
  failures: { id: string; period: string; n: number; retryAt: string | null }[];
  rescheduled: { id: string; next: string }[];
  unreadable: { id: string; message: string }[];
};
let world: World;
let confirmWith: (ref: string) => ConfirmOutcome | Promise<ConfirmOutcome>;
const charges: { reference: string; total: number }[] = [];
const failedEmails: { final: boolean }[] = [];
let accepting = true;
let chargeThrows = false;
let chargeRefused = false;

function deps(now: Date = NOW): MonthlyDeps {
  const store: MonthlyStore = {
    due: async () => ({ rows: world.due, unreadable: world.unreadable }),
    claim: async (id) => (world.claimed.has(id) ? false : (world.claimed.add(id), true)),
    attemptStatus: async (id) => (world.attempts.has(id) ? { status: world.attempts.get(id)!, createdAt: world.born } : null),
    stillActive: async () => world.active,
    createAttempt: async (_r, id) => void world.attempts.set(id, "pending"),
    reschedule: async (id, next) => void world.rescheduled.push({ id, next: next.toISOString() }),
    recordPaid: async (id, period, next) => void world.paid.push({ id, period, next: next.toISOString() }),
    recordFailure: async (id, period, n, retryAt) => void world.failures.push({ id, period, n, retryAt: retryAt?.toISOString() ?? null }),
    failAttempt: async (id) => void world.attempts.set(id, "failed"),
  };
  return {
    store,
    now,
    charge: async ({ reference, totalCents }) => {
      if (chargeThrows) throw new Error("network down");
      if (chargeRefused) throw new Error("refused: authorization is not active");
      charges.push({ reference, total: totalCents });
    },
    confirm: async (ref) => {
      const o = await confirmWith(ref);
      world.attempts.set(ref, o === "paid" ? "paid" : o === "failed" ? "failed" : "pending");
      return o;
    },
    charityState: async () => ({ accepting }),
    isNotFound: (e) => e instanceof Error && /not found/i.test(e.message),
    isRefused: (e) => e instanceof Error && /^refused/.test(e.message),
    notifyFailed: async (_r, info) => void failedEmails.push({ final: info.final }),
  };
}

beforeEach(() => {
  world = { due: [row()], attempts: new Map(), active: true, born: NOW, claimed: new Set(), paid: [], failures: [], rescheduled: [], unreadable: [] };
  confirmWith = () => "paid";
  charges.length = 0;
  failedEmails.length = 0;
  accepting = true;
  chargeThrows = false;
  chargeRefused = false;
});

describe("collecting a month", () => {
  it("charges the donation plus the contribution once, confirms it, and schedules next month", async () => {
    const s = await runMonthlyCharges(deps());
    expect(s).toMatchObject({ considered: 1, paid: 1, failed: 0, errors: [] });
    expect(charges).toEqual([{ reference: attemptDonationId("rec1", "2026-11", 0), total: 20_000 }]);
    expect(world.paid).toEqual([{ id: "rec1", period: "2026-11", next: chargeTime("2026-12", 15).toISOString() }]);
  });

  it("running the job again the same month charges nothing more", async () => {
    await runMonthlyCharges(deps());
    world.due = [row({ lastPaidPeriod: "2026-11" })];
    const s = await runMonthlyCharges(deps());
    expect(charges).toHaveLength(1);
    expect(s.alreadyPaid).toBe(1);
    expect(world.rescheduled).toEqual([{ id: "rec1", next: chargeTime("2026-12", 15).toISOString() }]);
  });

  it("after a pause, collects only the current month, never the months missed", async () => {
    world.due = [row({ lastPaidPeriod: "2026-07" })];
    await runMonthlyCharges(deps());
    expect(charges).toHaveLength(1);
    expect(world.paid[0].period).toBe("2026-11");
  });

  it("a donation another run has claimed is left alone", async () => {
    world.claimed.add("rec1");
    const s = await runMonthlyCharges(deps());
    expect(charges).toHaveLength(0);
    expect(s.waiting[0]).toMatchObject({ id: "rec1" });
  });

  it("does not charge for a charity that is not taking donations", async () => {
    accepting = false;
    const s = await runMonthlyCharges(deps());
    expect(charges).toHaveLength(0);
    expect(s.waiting[0].reason).toMatch(/not taking donations/);
  });
});

describe("when a payment does not settle at once", () => {
  it("a payment still pending is checked again next run, never charged again", async () => {
    confirmWith = () => "pending";
    await runMonthlyCharges(deps());
    expect(charges).toHaveLength(1);
    world.claimed.clear();
    confirmWith = () => "paid";
    const s = await runMonthlyCharges(deps());
    expect(charges).toHaveLength(1); // the same attempt exists, so only a check
    expect(s.paid).toBe(1);
  });

  it("if charging fails with an unknown outcome, the attempt stays pending and is not charged again", async () => {
    chargeThrows = true;
    const s1 = await runMonthlyCharges(deps());
    expect(s1.errors[0].message).toMatch(/network down/);
    expect(world.attempts.get(attemptDonationId("rec1", "2026-11", 0))).toBe("pending");
    chargeThrows = false;
    world.claimed.clear();
    const s2 = await runMonthlyCharges(deps());
    expect(charges).toHaveLength(0);
    expect(s2.paid).toBe(1);
  });

  it("a crash after the payment was confirmed but before it was recorded is put right on the next run", async () => {
    world.attempts.set(attemptDonationId("rec1", "2026-11", 0), "paid");
    const s = await runMonthlyCharges(deps());
    expect(charges).toHaveLength(0);
    expect(s.paid).toBe(1);
  });
});

describe("when the card is declined", () => {
  it("tries again after a day, and emails the donor", async () => {
    confirmWith = () => "failed";
    const s = await runMonthlyCharges(deps());
    expect(s).toMatchObject({ failed: 1, stopped: 0 });
    expect(world.failures).toEqual([{ id: "rec1", period: "2026-11", n: 1, retryAt: "2026-11-16T06:00:00.000Z" }]); // a day later, on the hour
    expect(failedEmails).toEqual([{ final: false }]);
  });

  it("each retry is a new attempt with its own id", async () => {
    confirmWith = () => "failed";
    world.due = [row({ attemptPeriod: "2026-11", failedAttempts: 1 })];
    await runMonthlyCharges(deps());
    expect(charges[0].reference).toBe(attemptDonationId("rec1", "2026-11", 1));
    expect(world.failures[0]).toMatchObject({ n: 2, retryAt: "2026-11-18T06:00:00.000Z" });
  });

  it("a retry never charges when an earlier attempt this month went through after all", async () => {
    world.due = [row({ attemptPeriod: "2026-11", failedAttempts: 1 })];
    world.attempts.set(attemptDonationId("rec1", "2026-11", 0), "failed");
    // The provider has since finished the first attempt.
    confirmWith = (ref) => (ref === attemptDonationId("rec1", "2026-11", 0) ? "paid" : "failed");
    const s = await runMonthlyCharges(deps());
    expect(charges).toEqual([]);
    expect(s).toMatchObject({ paid: 1, failed: 0 });
    expect(world.paid).toEqual([{ id: "rec1", period: "2026-11", next: "2026-12-15T06:00:00.000Z" }]);
  });

  it("a retry waits while an earlier attempt this month is still unsettled", async () => {
    world.due = [row({ attemptPeriod: "2026-11", failedAttempts: 1 })];
    world.attempts.set(attemptDonationId("rec1", "2026-11", 0), "failed");
    confirmWith = () => "pending";
    const s = await runMonthlyCharges(deps());
    expect(charges).toEqual([]);
    expect(s.waiting).toEqual([{ id: "rec1", reason: "an earlier attempt this month is not settled yet" }]);
  });

  it("stops after three failed attempts in a month", async () => {
    confirmWith = () => "failed";
    world.due = [row({ attemptPeriod: "2026-11", failedAttempts: 2 })];
    const s = await runMonthlyCharges(deps());
    expect(s).toMatchObject({ failed: 1, stopped: 1 });
    expect(world.failures[0]).toMatchObject({ n: 3, retryAt: null });
    expect(failedEmails).toEqual([{ final: true }]);
  });

  it("failures from an earlier month do not count against this month", async () => {
    confirmWith = () => "failed";
    world.due = [row({ attemptPeriod: "2026-10", failedAttempts: 2 })];
    await runMonthlyCharges(deps());
    expect(charges[0].reference).toBe(attemptDonationId("rec1", "2026-11", 0));
    expect(world.failures[0]).toMatchObject({ n: 1 });
  });

  it("a failed email never undoes the failure record", async () => {
    confirmWith = () => "failed";
    const d = deps();
    d.notifyFailed = async () => {
      throw new Error("mail down");
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const s = await runMonthlyCharges(d);
    expect(world.failures).toHaveLength(1);
    expect(s.errors).toEqual([]);
  });
});

describe("a donor who cancels at the last moment", () => {
  it("is not charged if the monthly donation stopped after it was read", async () => {
    world.active = false;
    const s = await runMonthlyCharges(deps());
    expect(charges).toEqual([]);
    expect(s.waiting).toEqual([{ id: "rec1", reason: "no longer active" }]);
    expect(s.paid).toBe(0);
  });
});

describe("an attempt that never reached the gateway", () => {
  const ref = attemptDonationId("rec1", "2026-11", 0);
  it("is sent again under the same reference once it is old enough, and then collected", async () => {
    world.attempts.set(ref, "pending");
    world.born = new Date(NOW.getTime() - 30 * 60_000);
    let known = false;
    confirmWith = () => {
      if (!known) {
        known = true;
        throw new Error("Paystack /transaction/verify failed: Transaction reference not found");
      }
      return "paid";
    };
    const s = await runMonthlyCharges(deps());
    expect(charges).toEqual([{ reference: ref, total: 20_000 }]);
    expect(s.paid).toBe(1);
  });

  it("an old pending attempt is not sent again when the gateway is merely down", async () => {
    world.attempts.set(ref, "pending");
    world.born = new Date(NOW.getTime() - 60 * 60_000);
    confirmWith = () => {
      throw new Error("gateway down");
    };
    const s = await runMonthlyCharges(deps());
    expect(charges).toEqual([]);
    expect(s.errors).toEqual([{ id: "rec1", message: "gateway down" }]);
  });

  it("a donor who stopped since the list was read gets no attempt row at all", async () => {
    world.active = false;
    await runMonthlyCharges(deps());
    expect(world.attempts.size).toBe(0);
  });

  it("a recent pending attempt is only checked, never sent again, and the error is reported", async () => {
    world.attempts.set(ref, "pending");
    world.born = new Date(NOW.getTime() - 60_000);
    confirmWith = () => {
      throw new Error("gateway down");
    };
    const s = await runMonthlyCharges(deps());
    expect(charges).toEqual([]);
    expect(s.errors).toEqual([{ id: "rec1", message: "gateway down" }]);
  });
});

describe("one donation never stops the others", () => {
  it("a donation whose stored card cannot be read is reported and the rest are still collected", async () => {
    world.due = [row({ id: "good" })];
    world.unreadable = [{ id: "broken", message: "the stored card could not be read" }];
    const s = await runMonthlyCharges(deps());
    expect(s.errors).toEqual([{ id: "broken", message: "the stored card could not be read" }]);
    expect(s.paid).toBe(1);
  });

  it("an error on one is reported and the rest are collected", async () => {
    world.due = [row({ id: "bad" }), row({ id: "good" })];
    const d = deps();
    const realClaim = d.store.claim;
    d.store.claim = async (id, now) => {
      if (id === "bad") throw new Error("database hiccup");
      return realClaim(id, now);
    };
    const s = await runMonthlyCharges(d);
    expect(s.errors).toEqual([{ id: "bad", message: "database hiccup" }]);
    expect(s.paid).toBe(1);
  });
});

describe("the end of the month", () => {
  it("a retry that runs after midnight on the 1st still collects the month it is for", async () => {
    // Charge day 31: the 31/01 attempt was declined, the retry falls on 01/02.
    const now = new Date("2027-02-01T06:30:00Z");
    world.due = [row({ chargeDay: 31, lastPaidPeriod: "2026-12", attemptPeriod: "2027-01", failedAttempts: 1, nextChargeAt: new Date("2027-02-01T06:00:00Z") })];
    await runMonthlyCharges(deps(now));
    expect(charges).toEqual([{ reference: attemptDonationId("rec1", "2027-01", 1), total: 20_000 }]);
    // January is paid, and February is still collected on its own day (the last day, 28/02).
    expect(world.paid).toEqual([{ id: "rec1", period: "2027-01", next: chargeTime("2027-02", 31).toISOString() }]);
  });

  it("a month-end attempt still pending after midnight is checked, not charged again", async () => {
    const now = new Date("2027-02-01T06:30:00Z");
    const january = attemptDonationId("rec1", "2027-01", 0);
    world.attempts.set(january, "pending");
    world.due = [row({ chargeDay: 31, lastPaidPeriod: "2026-12", nextChargeAt: new Date("2027-01-31T06:00:00Z") })];
    await runMonthlyCharges(deps(now));
    expect(charges).toEqual([]);
    expect(world.paid).toEqual([{ id: "rec1", period: "2027-01", next: chargeTime("2027-02", 31).toISOString() }]);
  });

  it("after a long pause, only the current month is collected (never a catch-up)", async () => {
    world.due = [row({ lastPaidPeriod: "2026-07", nextChargeAt: new Date("2026-08-15T06:00:00Z") })];
    await runMonthlyCharges(deps());
    expect(charges).toEqual([{ reference: attemptDonationId("rec1", "2026-11", 0), total: 20_000 }]);
    expect(world.paid[0].period).toBe("2026-11");
  });

  it("an old retry left from months ago does not charge that old month", async () => {
    world.due = [row({ lastPaidPeriod: "2026-07", attemptPeriod: "2026-08", failedAttempts: 1, nextChargeAt: new Date("2026-08-16T06:00:00Z") })];
    await runMonthlyCharges(deps());
    expect(charges).toEqual([{ reference: attemptDonationId("rec1", "2026-11", 0), total: 20_000 }]);
  });
});

describe("a payment the gateway took for a different amount", () => {
  it("is held for a person: not charged again this month, next collection is next month, no hourly retry", async () => {
    confirmWith = () => "review";
    const s = await runMonthlyCharges(deps());
    const ref = attemptDonationId("rec1", "2026-11", 0);
    expect(charges).toHaveLength(1);
    expect(s.review).toEqual([{ id: "rec1", donationId: ref }]);
    expect(s).toMatchObject({ paid: 0, failed: 0, waiting: [], errors: [] });
    expect(world.failures).toEqual([]);
    expect(world.rescheduled).toEqual([{ id: "rec1", next: "2026-12-15T06:00:00.000Z" }]);
    expect(world.attempts.get(ref)).toBe("pending");
  });
});

describe("a charge the gateway refuses outright", () => {
  it("counts as a failed attempt: retry later, email the donor, no re-sending", async () => {
    chargeRefused = true;
    confirmWith = () => { throw new Error("Transaction reference not found"); };
    const s = await runMonthlyCharges(deps());
    expect(s).toMatchObject({ failed: 1, errors: [] });
    expect(world.failures).toEqual([{ id: "rec1", period: "2026-11", n: 1, retryAt: "2026-11-16T06:00:00.000Z" }]);
    expect(failedEmails).toEqual([{ final: false }]);
    // The attempt's own donation does not stay pending for ever.
    expect(world.attempts.get(attemptDonationId("rec1", "2026-11", 0))).toBe("failed");
  });

  it("asks the gateway after a refusal, and goes by what it recorded", async () => {
    chargeRefused = true;
    confirmWith = () => "paid";
    const s = await runMonthlyCharges(deps());
    expect(s).toMatchObject({ paid: 1, failed: 0 });
    expect(world.failures).toEqual([]);
  });

  it("the third refusal stops the monthly donation", async () => {
    chargeRefused = true;
    confirmWith = () => "failed";
    world.due = [row({ attemptPeriod: "2026-11", failedAttempts: 2 })];
    const s = await runMonthlyCharges(deps());
    expect(s).toMatchObject({ failed: 1, stopped: 1 });
    expect(world.failures[0]).toMatchObject({ n: 3, retryAt: null });
  });
});

