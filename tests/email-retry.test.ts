/** Important emails tried again by the daily job (10/11/2026): the waits, the claims, skip versus fail, the last try, email off. */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));

const { afterTry, nextTryAt, safeErrorText, emailIsOn, gaveUpLine, MAX_TRIES } = await import("@/lib/email/retry-plan");
const { runEmailRetries } = await import("@/lib/email/retry");
const { declinedNoticeStillTrue, declinedInfoFrom } = await import("@/lib/donations/monthly-declined-retry");
const { DECLINED_REASON } = await import("@/lib/donations/monthly-reasons");
const { dailyDigest } = await import("@/lib/ops/daily");

type Row = { id: string; kind: "donation_confirmation" | "s18a_receipt" | "monthly_declined"; refId: string; payload: Record<string, unknown>; tries: number };
const T0 = new Date("2026-11-10T08:00:00+02:00");
const H = 3_600_000;

function fakeStore(rows: Row[], opts: { taken?: Set<string>; missing?: boolean } = {}) {
  const finished: Record<string, { status: string; tries: number; nextTryAt: Date | null; lastError: string | null }> = {};
  const claims: string[] = [];
  return {
    finished,
    claims,
    store: {
      async due() {
        return opts.missing ? null : rows;
      },
      async claim(id: string) {
        claims.push(id);
        if (opts.taken?.has(id)) return false;
        opts.taken?.add(id);
        return true;
      },
      async finish(id: string, p: { status: string; tries: number; nextTryAt: Date | null; lastError: string | null }) {
        finished[id] = p;
      },
    },
  };
}
const row = (id: string, o: Partial<Row> = {}): Row => ({ id, kind: "donation_confirmation", refId: `ref-${id}`, payload: {}, tries: 1, ...o });

describe("the waits", () => {
  it("tries an hour after the first failure, then a day, then three days, then stops", () => {
    expect(nextTryAt(1, T0)!.getTime() - T0.getTime()).toBe(1 * H);
    expect(nextTryAt(2, T0)!.getTime() - T0.getTime()).toBe(24 * H);
    expect(nextTryAt(3, T0)!.getTime() - T0.getTime()).toBe(72 * H);
    expect(nextTryAt(4, T0)).toBeNull();
    expect(MAX_TRIES).toBe(4);
  });
  it("refuses nonsense", () => {
    expect(nextTryAt(0, T0)).toBeNull();
    expect(nextTryAt(1.5, T0)).toBeNull();
  });
});

describe("after a try", () => {
  it("stops for good when it went, was skipped on purpose, or has nothing left to send", () => {
    for (const r of ["sent", "skipped", "gone"] as const) expect(afterTry(2, r, T0)).toEqual({ status: r, tries: 3, nextTryAt: null });
  });
  it("waits again after a failure, until the last try", () => {
    expect(afterTry(1, "failed", T0)).toEqual({ status: "waiting", tries: 2, nextTryAt: new Date(T0.getTime() + 24 * H) });
    expect(afterTry(2, "failed", T0)).toEqual({ status: "waiting", tries: 3, nextTryAt: new Date(T0.getTime() + 72 * H) });
    expect(afterTry(3, "failed", T0)).toEqual({ status: "gave_up", tries: 4, nextTryAt: null });
  });
  it("doesn't use up a try when another run is sending it", () => {
    expect(afterTry(2, "busy", T0)).toEqual({ status: "waiting", tries: 2, nextTryAt: new Date(T0.getTime() + H) });
  });
  it("keeps a failure message short, on one line, and without an email address", () => {
    const t = safeErrorText(new Error("Resend 422: thandi.mokoena@example.co.za\nis not allowed"));
    expect(t).toBe("Resend 422: [email] is not allowed");
    expect(safeErrorText("x".repeat(500))).toHaveLength(300);
  });
});

describe("the daily run of tries", () => {
  const handlers = (fn: (r: Row) => Promise<"sent" | "skipped" | "gone" | "busy">) => ({ donation_confirmation: fn, s18a_receipt: fn, monthly_declined: fn });

  it("does nothing at all while email is off", async () => {
    const f = fakeStore([row("a")]);
    const send = vi.fn(async () => "sent" as const);
    const s = await runEmailRetries({ store: f.store, handlers: handlers(send), now: T0, deadline: Infinity, emailOn: false });
    expect(s.off).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(f.claims).toEqual([]);
    expect(f.finished).toEqual({});
  });

  it("knows email is off with the console transport", () => {
    expect(emailIsOn({})).toBe(false);
    expect(emailIsOn({ EMAIL_TRANSPORT: "console" })).toBe(false);
    expect(emailIsOn({ EMAIL_TRANSPORT: "resend" })).toBe(true);
  });

  it("says when the list isn't there yet", async () => {
    const f = fakeStore([], { missing: true });
    expect((await runEmailRetries({ store: f.store, handlers: handlers(async () => "sent"), now: T0, deadline: Infinity, emailOn: true })).notSetUp).toBe(true);
  });

  it("sends only what it claimed: a row another run has is left alone", async () => {
    const f = fakeStore([row("a"), row("b")], { taken: new Set(["b"]) });
    const send = vi.fn(async () => "sent" as const);
    const audit = vi.fn(async () => undefined);
    const s = await runEmailRetries({ store: f.store, handlers: handlers(send), now: T0, deadline: Infinity, emailOn: true, audit });
    expect(send).toHaveBeenCalledTimes(1);
    expect(s.resent).toBe(1);
    expect(Object.keys(f.finished)).toEqual(["a"]);
    expect(audit).toHaveBeenCalledWith("email.retry_sent", expect.objectContaining({ id: "a" }), { kind: "donation_confirmation", try: 2 });
  });

  it("never sends the same row twice when two runs go at once", async () => {
    const taken = new Set<string>();
    const rows = [row("a")];
    const send = vi.fn(async () => "sent" as const);
    const one = fakeStore(rows, { taken });
    const two = fakeStore(rows, { taken });
    await Promise.all([
      runEmailRetries({ store: one.store, handlers: handlers(send), now: T0, deadline: Infinity, emailOn: true }),
      runEmailRetries({ store: two.store, handlers: handlers(send), now: T0, deadline: Infinity, emailOn: true }),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("treats a skip as done, not as a failure to try forever", async () => {
    const f = fakeStore([row("a", { tries: 2 })]);
    const s = await runEmailRetries({ store: f.store, handlers: handlers(async () => "skipped"), now: T0, deadline: Infinity, emailOn: true });
    expect(s).toMatchObject({ skipped: 1, failedAgain: 0, gaveUp: 0 });
    expect(f.finished.a).toMatchObject({ status: "skipped", nextTryAt: null });
  });

  it("counts a failure, keeps the reason, and gives up after the last try with one audit row", async () => {
    const f = fakeStore([row("a", { tries: 1 }), row("b", { tries: 3, kind: "s18a_receipt" })]);
    const audit = vi.fn(async () => undefined);
    const s = await runEmailRetries({
      store: f.store,
      handlers: handlers(async () => {
        throw new Error("timeout talking to sipho@example.test");
      }),
      now: T0,
      deadline: Infinity,
      emailOn: true,
      audit,
    });
    expect(s).toMatchObject({ failedAgain: 1, gaveUp: 1, resent: 0 });
    expect(f.finished.a).toMatchObject({ status: "waiting", tries: 2, lastError: "timeout talking to [email]" });
    expect(f.finished.b).toMatchObject({ status: "gave_up", tries: 4, nextTryAt: null });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith("email.retry_gave_up", expect.objectContaining({ id: "b" }), { kind: "s18a_receipt", tries: 4, message: "timeout talking to [email]" });
  });

  it("stops at its time limit and leaves the rest for tomorrow", async () => {
    const f = fakeStore([row("a"), row("b")]);
    const s = await runEmailRetries({ store: f.store, handlers: handlers(async () => "sent"), now: T0, deadline: Date.now() - 1, emailOn: true });
    expect(s.incomplete).toBe(true);
    expect(f.claims).toEqual([]);
  });

  it("sends each kind to its own sender", async () => {
    const seen: string[] = [];
    const f = fakeStore([row("a"), row("b", { kind: "s18a_receipt" }), row("c", { kind: "monthly_declined" })]);
    await runEmailRetries({
      store: f.store,
      handlers: {
        donation_confirmation: async (r) => (seen.push(`confirmation:${r.refId}`), "sent"),
        s18a_receipt: async (r) => (seen.push(`receipt:${r.refId}`), "sent"),
        monthly_declined: async (r) => (seen.push(`declined:${r.refId}`), "gone"),
      },
      now: T0,
      deadline: Infinity,
      emailOn: true,
    });
    expect(seen).toEqual(["confirmation:ref-a", "receipt:ref-b", "declined:ref-c"]);
  });
});

describe("a declined-card notice tried again", () => {
  const info = { totalCents: 25_000, final: false, failedAt: "2026-11-10T06:00:00.000Z" };
  it("still goes while the donation runs and nothing was paid since", () => {
    expect(declinedNoticeStillTrue({ status: "active", ended_reason: null }, info, false)).toBe(true);
  });
  it("doesn't go once a gift was paid since, or the donor paused or cancelled", () => {
    expect(declinedNoticeStillTrue({ status: "active", ended_reason: null }, info, true)).toBe(false);
    expect(declinedNoticeStillTrue({ status: "paused", ended_reason: null }, info, false)).toBe(false);
    expect(declinedNoticeStillTrue({ status: "cancelled", ended_reason: "cancelled by the donor" }, info, false)).toBe(false);
  });
  it("sends the final notice only while the donation is still stopped for a declined card", () => {
    const final = { ...info, final: true };
    expect(declinedNoticeStillTrue({ status: "failed", ended_reason: DECLINED_REASON }, final, false)).toBe(true);
    expect(declinedNoticeStillTrue({ status: "active", ended_reason: null }, final, false)).toBe(false);
  });
  it("reads back only a sane kept notice", () => {
    expect(declinedInfoFrom(info)).toEqual(info);
    expect(declinedInfoFrom({ ...info, totalCents: 12.5 })).toBeNull();
    expect(declinedInfoFrom({ ...info, final: "yes" })).toBeNull();
    expect(declinedInfoFrom({ ...info, failedAt: "soon" })).toBeNull();
  });
});

describe("Givezy's daily email", () => {
  const quiet = { incomplete: false, cardUpdatesFinished: 0, pending: { checked: 0, paid: 0, failed: 0, still: 0, errors: 0 }, stuckPending: 0, confirmations: { resent: 0, failedAgain: 0 }, unhandledEvents: 0, held: {} };
  const fine = { monthlyErrors: 0, monthlyReview: 0, monthlyStopped: 0, payoutsFailed: false, monthlyFailed: false };
  it("says nothing about emails that went, were skipped or are still waiting", () => {
    expect(dailyDigest({ ...quiet, emailRetries: { resent: 3, skipped: 1, gone: 1, failedAgain: 2, gaveUp: 0 } }, fine)).toEqual([]);
  });
  it("tells Givezy once, with a count only, when emails gave up", () => {
    const lines = dailyDigest({ ...quiet, emailRetries: { resent: 0, skipped: 0, gone: 0, failedAgain: 0, gaveUp: 2 } }, fine);
    expect(lines).toEqual([gaveUpLine(2)]);
    expect(lines[0]).toMatch(/^2 important emails to donors .* after 3 more tries/);
    expect(lines[0]).not.toMatch(/@/);
  });
});
