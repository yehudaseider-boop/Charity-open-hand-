import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { runMonthlyCharges } = await import("@/lib/donations/monthly-job");
const { attemptDonationId, chargeTime } = await import("@/lib/donations/schedule");
import type { CollectionOutcome, DueMonthly, MonthlyDeps, MonthlyStore } from "@/lib/donations/monthly-job";

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
let confirmWith: (ref: string) => CollectionOutcome | Promise<CollectionOutcome>;
const closeAsked: (Date | undefined)[] = [];
const charges: { reference: string; total: number }[] = [];
const failedEmails: { final: boolean }[] = [];
let accepting = true;
let chargeThrows = false;
let chargeRefused = false;
/** The gateway turned the charge down for a reason that is not the card (a field, the split, our key). */
let chargeRejected = false;
/** The charity stopped taking donations between the run's check and the charge itself. */
let stopsAtCharge = false;
/** Amounts saved on an existing attempt (the store's record of it), by donation id. */
const savedAmounts = new Map<string, { amountCents: number; contributionCents: number; cardChargeCents: number; totalCents: number }>();
const dropped: string[] = [];
/** The monthly donation a donation row belongs to, when not rec1 (null: a once-off gift), by donation id. */
const owners = new Map<string, string | null>();
const audits: { action: string; id: string; details: Record<string, unknown> }[] = [];

function deps(now: Date = NOW): MonthlyDeps {
  const store: MonthlyStore = {
    due: async () => ({ rows: world.due, unreadable: world.unreadable }),
    claim: async (id) => (world.claimed.has(id) ? false : (world.claimed.add(id), true)),
    attemptStatus: async (id) =>
      world.attempts.has(id) ? { status: world.attempts.get(id)!, createdAt: world.born, recurringId: owners.has(id) ? owners.get(id)! : "rec1", saved: savedAmounts.get(id) } : null,
    dropUnsent: async (id) => {
      dropped.push(id);
      if (world.attempts.get(id) === "pending") world.attempts.delete(id);
    },
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
      if (stopsAtCharge) return "not_accepting";
      if (chargeThrows) throw new Error("network down");
      if (chargeRefused) throw new Error("refused: authorization is not active");
      if (chargeRejected) throw new Error("rejected: Invalid split configuration");
      charges.push({ reference, total: totalCents });
    },
    confirm: async (ref, opts) => {
      closeAsked.push(opts?.closeUnpaidBefore);
      const o = await confirmWith(ref);
      world.attempts.set(ref, o === "paid" ? "paid" : o === "failed" || o === "closed_unpaid" ? "failed" : "pending");
      return o;
    },
    charityState: async () => ({ accepting }),
    isNotFound: (e) => e instanceof Error && /not found/i.test(e.message),
    isDeclined: (e) => e instanceof Error && /^refused/.test(e.message),
    audit: async (action, id, details) => void audits.push({ action, id, details }),
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
  chargeRejected = false;
  stopsAtCharge = false;
  savedAmounts.clear();
  owners.clear();
  dropped.length = 0;
  audits.length = 0;
  closeAsked.length = 0;
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

  it("back after a pause past the charge day, charges this month once, and never last month as well (review 20/11/2026)", async () => {
    // Charge day 15; giving paused from 10/10 to 20/11, so the row still says 15/10.
    const later = new Date("2026-11-20T06:30:00Z");
    world.due = [row({ lastPaidPeriod: "2026-09", nextChargeAt: new Date("2026-10-15T06:00:00Z") })];
    await runMonthlyCharges(deps(later));
    expect(charges).toEqual([{ reference: attemptDonationId("rec1", "2026-11", 0), total: 20_000 }]);
    expect(world.paid[0]).toMatchObject({ period: "2026-11", next: chargeTime("2026-12", 15).toISOString() });
    // The next day's run finds nothing due: one charge, not two.
    world.due = [];
    world.claimed.clear();
    await runMonthlyCharges(deps(new Date("2026-11-21T06:30:00Z")));
    expect(charges).toHaveLength(1);
  });

  it("back after a pause before this month's charge day: waits for the day, charges nothing now", async () => {
    world.due = [row({ lastPaidPeriod: "2026-09", nextChargeAt: new Date("2026-10-15T06:00:00Z") })];
    const s = await runMonthlyCharges(deps(new Date("2026-11-05T06:30:00Z")));
    expect(charges).toEqual([]);
    expect(world.rescheduled).toEqual([{ id: "rec1", next: chargeTime("2026-11", 15).toISOString() }]);
    expect(s.waiting[0].reason).toMatch(/after a pause/);
  });

  it("a run a day late (after midnight on the 1st) still collects last month's charge day", async () => {
    world.due = [row({ chargeDay: 31, lastPaidPeriod: "2026-09", nextChargeAt: new Date("2026-10-31T06:00:00Z") })];
    await runMonthlyCharges(deps(new Date("2026-11-01T05:00:00Z")));
    expect(charges).toEqual([{ reference: attemptDonationId("rec1", "2026-10", 0), total: 20_000 }]);
  });

  it("an old retry left from months ago does not charge that old month", async () => {
    world.due = [row({ lastPaidPeriod: "2026-07", attemptPeriod: "2026-08", failedAttempts: 1, nextChargeAt: new Date("2026-08-16T06:00:00Z") })];
    await runMonthlyCharges(deps());
    expect(charges).toEqual([{ reference: attemptDonationId("rec1", "2026-11", 0), total: 20_000 }]);
  });
});

describe("a retry held back for weeks (review 23/11/2026)", () => {
  // Charge day 15: the 15/10 try was declined, the retry was due 16/10, and the charity stopped taking donations until 14/11.
  const heldRetry = (o: Partial<DueMonthly> = {}) =>
    row({ lastPaidPeriod: "2026-09", attemptPeriod: "2026-10", failedAttempts: 1, nextChargeAt: new Date("2026-10-16T06:00:00Z"), ...o });

  it("before this month's charge day, never charges the skipped month: waits for the day", async () => {
    world.due = [heldRetry()];
    const s = await runMonthlyCharges(deps(new Date("2026-11-14T06:30:00Z")));
    expect(charges).toEqual([]);
    expect(world.rescheduled).toEqual([{ id: "rec1", next: chargeTime("2026-11", 15).toISOString() }]);
    expect(s.waiting[0].reason).toMatch(/after a pause/);
  });

  it("on the charge day, collects this month as its first try, with no failed tries carried over", async () => {
    confirmWith = () => "failed";
    // As the waiting run above left it: next collection moved to 15/11, the October retry state still on the row.
    world.due = [heldRetry({ nextChargeAt: chargeTime("2026-11", 15) })];
    await runMonthlyCharges(deps());
    expect(charges).toEqual([{ reference: attemptDonationId("rec1", "2026-11", 0), total: 20_000 }]);
    expect(world.failures).toEqual([{ id: "rec1", period: "2026-11", n: 1, retryAt: "2026-11-16T06:00:00.000Z" }]);
  });

  it("held past this month's charge day: collects this month once, never October as well", async () => {
    world.due = [heldRetry()];
    await runMonthlyCharges(deps(new Date("2026-11-20T06:30:00Z")));
    expect(charges).toEqual([{ reference: attemptDonationId("rec1", "2026-11", 0), total: 20_000 }]);
    expect(world.paid[0]).toMatchObject({ period: "2026-11", next: chargeTime("2026-12", 15).toISOString() });
  });

  it("a retry on time still collects the month it is for", async () => {
    world.due = [heldRetry()];
    await runMonthlyCharges(deps(new Date("2026-10-16T06:30:00Z")));
    expect(charges).toEqual([{ reference: attemptDonationId("rec1", "2026-10", 1), total: 20_000 }]);
    expect(world.paid[0]).toMatchObject({ period: "2026-10" });
  });

  it("a retry a day or two late (within the grace) still collects the month it is for", async () => {
    world.due = [heldRetry()];
    await runMonthlyCharges(deps(new Date("2026-10-18T06:30:00Z")));
    expect(charges).toEqual([{ reference: attemptDonationId("rec1", "2026-10", 1), total: 20_000 }]);
  });

  it("held back within its own month, it stays this month's retry (earlier tries still count)", async () => {
    confirmWith = () => "failed";
    world.due = [row({ chargeDay: 1, lastPaidPeriod: "2026-10", attemptPeriod: "2026-11", failedAttempts: 1, nextChargeAt: new Date("2026-11-02T06:00:00Z") })];
    await runMonthlyCharges(deps());
    expect(charges).toEqual([{ reference: attemptDonationId("rec1", "2026-11", 1), total: 20_000 }]);
    expect(world.failures[0]).toMatchObject({ period: "2026-11", n: 2 });
  });
});

describe("a collection id already used by another gift (review 23/11/2026)", () => {
  it("this month's try: never charged, asked about or counted as paid; reported for a person", async () => {
    const id = attemptDonationId("rec1", "2026-11", 0);
    world.attempts.set(id, "paid");
    owners.set(id, null); // someone's once-off gift
    vi.spyOn(console, "error").mockImplementation(() => {});
    const s = await runMonthlyCharges(deps());
    expect(charges).toEqual([]);
    expect(closeAsked).toEqual([]);
    expect(world.paid).toEqual([]);
    expect(world.failures).toEqual([]);
    expect(s).toMatchObject({ paid: 0, failed: 0 });
    expect(s.errors[0]).toMatchObject({ id: "rec1", message: expect.stringMatching(/already used by another gift, so nothing was charged/) });
  });

  it("an earlier try's id: never taken as this month paid or declined", async () => {
    const earlier = attemptDonationId("rec1", "2026-11", 0);
    world.attempts.set(earlier, "paid");
    owners.set(earlier, "rec-other");
    world.due = [row({ attemptPeriod: "2026-11", failedAttempts: 1 })];
    vi.spyOn(console, "error").mockImplementation(() => {});
    const asked: string[] = [];
    confirmWith = (ref) => (asked.push(ref), "paid");
    await runMonthlyCharges(deps());
    expect(asked).not.toContain(earlier);
    // The retry itself goes ahead as normal under its own id.
    expect(charges).toEqual([{ reference: attemptDonationId("rec1", "2026-11", 1), total: 20_000 }]);
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


describe("a charge the gateway turns down for a reason that isn't the card", () => {
  const ref = attemptDonationId("rec1", "2026-11", 0);

  it("is an error for a person: no try counted, no email, the card kept, the attempt left to check next run", async () => {
    chargeRejected = true;
    const s = await runMonthlyCharges(deps());
    expect(s).toMatchObject({ paid: 0, failed: 0, stopped: 0 });
    expect(s.errors).toEqual([{ id: "rec1", message: "rejected: Invalid split configuration" }]);
    expect(world.failures).toEqual([]);
    expect(failedEmails).toEqual([]);
    expect(world.attempts.get(ref)).toBe("pending");
    expect(audits).toEqual([{ action: "monthly.charge_error", id: "rec1", details: { donationId: ref, message: "rejected: Invalid split configuration" } }]);
  });

  it("a network failure or outage while charging is the same: never a decline", async () => {
    chargeThrows = true;
    const s = await runMonthlyCharges(deps());
    expect(s.failed).toBe(0);
    expect(failedEmails).toEqual([]);
    expect(audits.map((a) => a.action)).toEqual(["monthly.charge_error"]);
  });

  it("next run, if the gateway never received it, it is sent again under the same reference (never counted)", async () => {
    chargeRejected = true;
    await runMonthlyCharges(deps());
    chargeRejected = false;
    world.claimed.clear();
    world.born = new Date(NOW.getTime() - 24 * 3_600_000);
    let asked = 0;
    confirmWith = () => {
      if (asked++ === 0) throw new Error("Transaction reference not found");
      return "paid";
    };
    const s = await runMonthlyCharges(deps(new Date(NOW.getTime() + 24 * 3_600_000)));
    expect(charges).toEqual([{ reference: ref, total: 20_000 }]);
    expect(s.paid).toBe(1);
    expect(world.failures).toEqual([]);
  });

  it("an audit log that can't be written never hides the error", async () => {
    chargeRejected = true;
    const d = deps();
    d.audit = async () => {
      throw new Error("audit down");
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const s = await runMonthlyCharges(d);
    expect(s.errors).toEqual([{ id: "rec1", message: "rejected: Invalid split configuration" }]);
  });
});

describe("a try still pending at the gateway after 48 hours: never charge twice", () => {
  const ref = attemptDonationId("rec1", "2026-11", 0);
  const held = { id: "rec1", donationId: ref, totalCents: 20_000, charityName: "Meals Fund" };
  beforeEach(() => {
    world.attempts.set(ref, "pending");
    confirmWith = () => "pending";
  });

  it("before 48 hours it only waits", async () => {
    world.born = new Date(NOW.getTime() - 47 * 3_600_000);
    const s = await runMonthlyCharges(deps());
    expect(s.waiting).toEqual([{ id: "rec1", reason: "payment pending" }]);
    expect(s.waitingOnProvider).toEqual([]);
    expect(world.failures).toEqual([]);
  });

  it("(b) after 48 hours the monthly donation is held: no new try, no try counted, no email, card kept, a person told", async () => {
    world.born = new Date(NOW.getTime() - 49 * 3_600_000);
    const s = await runMonthlyCharges(deps());
    expect(charges).toEqual([]);
    expect(world.failures).toEqual([]);
    expect(world.rescheduled).toEqual([]);
    expect(failedEmails).toEqual([]);
    expect(world.attempts.get(ref)).toBe("pending");
    expect(s).toMatchObject({ failed: 0, stopped: 0, waitingOnProvider: [held] });
    expect(audits).toEqual([{ action: "monthly.waiting_on_provider", id: "rec1", details: { donationId: ref, totalCents: 20_000, charityName: "Meals Fund" } }]);
  });

  it("(a, b) every later run asks the gateway again first, and while it is still pending nothing more is charged", async () => {
    world.born = new Date(NOW.getTime() - 49 * 3_600_000);
    for (let day = 0; day < 5; day++) {
      world.claimed.clear();
      const s = await runMonthlyCharges(deps(new Date(NOW.getTime() + day * 24 * 3_600_000)));
      expect(s.waitingOnProvider).toEqual([held]);
    }
    expect(charges).toEqual([]);
    expect(world.failures).toEqual([]);
    // Asked about each run, with the 48-hour cut-off so an abandoned or never-received try can be closed.
    expect(closeAsked).toHaveLength(5);
    expect(closeAsked.every((d) => d instanceof Date)).toBe(true);
  });

  it("(b) an earlier try this month still pending after 48 hours holds the retry too: no new try is started", async () => {
    world.attempts.clear();
    world.attempts.set(ref, "failed");
    world.born = new Date(NOW.getTime() - 72 * 3_600_000);
    world.due = [row({ attemptPeriod: "2026-11", failedAttempts: 1 })];
    const s = await runMonthlyCharges(deps());
    expect(charges).toEqual([]);
    expect(world.attempts.has(attemptDonationId("rec1", "2026-11", 1))).toBe(false);
    expect(s.waitingOnProvider).toEqual([held]);
    expect(failedEmails).toEqual([]);
  });

  it("(c) if the gateway later says it was paid, the month is recorded as paid as normal", async () => {
    world.born = new Date(NOW.getTime() - 49 * 3_600_000);
    await runMonthlyCharges(deps());
    world.claimed.clear();
    confirmWith = () => "paid";
    const s = await runMonthlyCharges(deps());
    expect(s.paid).toBe(1);
    expect(world.paid).toEqual([{ id: "rec1", period: "2026-11", next: "2026-12-15T06:00:00.000Z" }]);
    expect(charges).toEqual([]);
  });

  it("(c) if the gateway later says it failed, the try is counted and the normal retry follows", async () => {
    world.born = new Date(NOW.getTime() - 49 * 3_600_000);
    await runMonthlyCharges(deps());
    world.claimed.clear();
    confirmWith = () => "failed";
    const s = await runMonthlyCharges(deps());
    expect(s).toMatchObject({ failed: 1, stopped: 0 });
    expect(world.failures).toEqual([{ id: "rec1", period: "2026-11", n: 1, retryAt: "2026-11-16T06:00:00.000Z" }]);
  });

  it("(c) if the gateway says it was abandoned or never received, the try is counted (no 'declined' email) and the retry follows", async () => {
    world.born = new Date(NOW.getTime() - 49 * 3_600_000);
    confirmWith = () => "closed_unpaid";
    const s = await runMonthlyCharges(deps());
    expect(world.failures).toEqual([{ id: "rec1", period: "2026-11", n: 1, retryAt: "2026-11-16T06:00:00.000Z" }]);
    expect(failedEmails).toEqual([]);
    expect(s.unconfirmed).toEqual([{ id: "rec1", donationId: ref, why: "closed_unpaid" }]);
    expect(audits.map((a) => a.action)).toEqual(["monthly.try_unconfirmed"]);
    // The retry is a new try under its own reference, only once the old one is closed.
    world.claimed.clear();
    world.due = [row({ attemptPeriod: "2026-11", failedAttempts: 1 })];
    confirmWith = (r) => (r === ref ? "failed" : "paid");
    const s2 = await runMonthlyCharges(deps(new Date("2026-11-16T06:30:00Z")));
    expect(charges).toEqual([{ reference: attemptDonationId("rec1", "2026-11", 1), total: 20_000 }]);
    expect(s2.paid).toBe(1);
  });

  it("(c) as the month's last try, abandoned or never received never stops the monthly donation: next month as usual", async () => {
    const third = attemptDonationId("rec1", "2026-11", 2);
    world.attempts.clear();
    world.attempts.set(third, "pending");
    world.born = new Date(NOW.getTime() - 49 * 3_600_000);
    world.due = [row({ attemptPeriod: "2026-11", failedAttempts: 2 })];
    confirmWith = () => "closed_unpaid";
    const s = await runMonthlyCharges(deps());
    expect(s).toMatchObject({ failed: 1, stopped: 0 });
    expect(world.failures).toEqual([{ id: "rec1", period: "2026-11", n: 3, retryAt: chargeTime("2026-12", 15).toISOString() }]);
    expect(failedEmails).toEqual([]);
  });
});

describe("an attempt marked failed here that the gateway never received", () => {
  it("is counted as a failed try and the month moves on, instead of an error every day (no email)", async () => {
    const ref = attemptDonationId("rec1", "2026-11", 0);
    world.attempts.set(ref, "failed");
    world.born = new Date(NOW.getTime() - 3 * 3_600_000);
    confirmWith = () => {
      throw new Error("Transaction reference not found");
    };
    const s = await runMonthlyCharges(deps());
    expect(s.errors).toEqual([]);
    expect(charges).toEqual([]);
    expect(world.failures).toEqual([{ id: "rec1", period: "2026-11", n: 1, retryAt: "2026-11-16T06:00:00.000Z" }]);
    expect(failedEmails).toEqual([]);
    expect(s.unconfirmed).toEqual([{ id: "rec1", donationId: ref, why: "never_received" }]);
  });

  it("any other error about it is still reported, not counted", async () => {
    world.attempts.set(attemptDonationId("rec1", "2026-11", 0), "failed");
    confirmWith = () => {
      throw new Error("gateway down");
    };
    const s = await runMonthlyCharges(deps());
    expect(s.errors).toEqual([{ id: "rec1", message: "gateway down" }]);
    expect(world.failures).toEqual([]);
  });
});

describe("review 20/11/2026: sending again and a charity that stops mid-run", () => {
  const ref = attemptDonationId("rec1", "2026-11", 0);
  it("a stuck attempt is sent again with the amounts saved on it, never today's", async () => {
    world.attempts.set(ref, "pending");
    world.born = new Date(NOW.getTime() - 30 * 60_000);
    // Made when the card charge cover was R5.50; today's figure would be R6.10.
    savedAmounts.set(ref, { amountCents: 18_000, contributionCents: 2_000, cardChargeCents: 550, totalCents: 20_550 });
    world.due = [row({ cardChargeCents: 610 })];
    let known = false;
    confirmWith = () => {
      if (!known) {
        known = true;
        throw new Error("Transaction reference not found");
      }
      return "paid";
    };
    const s = await runMonthlyCharges(deps());
    expect(charges).toEqual([{ reference: ref, total: 20_550 }]);
    expect(s.paid).toBe(1);
  });

  it("a charity that stops taking donations just before the charge: nothing sent, the attempt removed, no try counted", async () => {
    stopsAtCharge = true;
    const s = await runMonthlyCharges(deps());
    expect(charges).toEqual([]);
    expect(dropped).toEqual([ref]);
    expect(world.attempts.has(ref)).toBe(false);
    expect(world.failures).toEqual([]);
    expect(failedEmails).toEqual([]);
    expect(s.waiting).toContainEqual({ id: "rec1", reason: "the charity is not taking donations right now" });
    // Once it takes donations again, the next run makes the attempt afresh and collects it.
    stopsAtCharge = false;
    world.claimed.clear();
    const again = await runMonthlyCharges(deps());
    expect(charges).toEqual([{ reference: ref, total: 20_000 }]);
    expect(again.paid).toBe(1);
  });
});
