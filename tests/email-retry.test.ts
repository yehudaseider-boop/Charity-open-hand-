/** Important emails tried again by the daily job (10/11/2026): the waits, the claims, skip versus fail, the last try, email off. */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
/** Every call made on the admin client, as [method, ...args], so a write's filters can be checked. */
const dbCalls: unknown[][] = [];
const chain: Record<string, unknown> = {};
for (const m of ["from", "update", "eq", "is", "lt", "select", "upsert"]) chain[m] = (...args: unknown[]) => (dbCalls.push([m, ...args]), chain);
chain.then = (ok: (v: unknown) => unknown) => ok({ data: [], error: null });
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => chain }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));

const { afterTry, nextTryAt, safeErrorText, emailIsOn, retryDigestLines, tooOld, wasCutOff, mayHaveSent, MAX_TRIES } = await import("@/lib/email/retry-plan");
const { EmailError, EmailMaybeSent } = await import("@/lib/email");
const { runEmailRetries, markRetryGone, recordFailedConfirmations } = await import("@/lib/email/retry");
const { declinedNoticeStillTrue, declinedInfoFrom } = await import("@/lib/donations/monthly-declined-retry");
const { DECLINED_REASON } = await import("@/lib/donations/monthly-reasons");
const { dailyDigest } = await import("@/lib/ops/daily");

type Row = { id: string; kind: "donation_confirmation" | "s18a_receipt" | "monthly_declined"; refId: string; payload: Record<string, unknown>; tries: number; createdAt: Date };
type Patch = { status: string; tries: number; nextTryAt: Date | null; lastError: string | null };
const T0 = new Date("2026-11-10T08:00:00+02:00");
const H = 3_600_000;

function fakeStore(rows: Row[], opts: { taken?: Set<string>; missing?: boolean; stale?: Set<string>; finishFails?: Set<string> } = {}) {
  const finished: Record<string, Patch> = {};
  const tokens: Record<string, string> = {};
  const claims: string[] = [];
  return {
    finished,
    tokens,
    claims,
    store: {
      async due() {
        return opts.missing ? null : rows;
      },
      async claim(id: string) {
        claims.push(id);
        if (opts.stale?.has(id)) return { token: `t-${id}`, tookOver: true };
        if (opts.taken?.has(id)) return null;
        opts.taken?.add(id);
        return { token: `t-${id}`, tookOver: false };
      },
      async finish(id: string, claim: { token: string }, p: Patch) {
        if (opts.finishFails?.has(id)) throw new Error("database went away");
        finished[id] = p;
        tokens[id] = claim.token;
      },
    },
  };
}
const row = (id: string, o: Partial<Row> = {}): Row => ({ id, kind: "donation_confirmation", refId: `ref-${id}`, payload: {}, tries: 1, createdAt: T0, ...o });
const cutOff = () => new EmailMaybeSent("The send to Resend was cut off: The operation was aborted due to timeout");

describe("the waits", () => {
  it("tries an hour after the first failure, then a day, then three days, then stops", () => {
    expect(nextTryAt(1, T0)!.getTime() - T0.getTime()).toBe(1 * H);
    expect(nextTryAt(2, T0)!.getTime() - T0.getTime()).toBe(24 * H);
    expect(nextTryAt(3, T0)!.getTime() - T0.getTime()).toBe(72 * H);
    expect(nextTryAt(4, T0)).toBeNull();
    expect(MAX_TRIES).toBe(4);
  });
  it("rounds the next try down to the hour, so a once-a-day job finds it on the day meant, not a day late", () => {
    // Finished at 06:16 after a run that started at 06:05: tomorrow's 06:05 run must find it.
    const finishedAt = new Date("2026-11-10T06:16:42Z");
    expect(nextTryAt(2, finishedAt)).toEqual(new Date("2026-11-11T06:00:00Z"));
    expect(afterTry(2, "failed", finishedAt).nextTryAt).toEqual(new Date("2026-11-13T06:00:00Z"));
    expect(afterTry(2, "busy", finishedAt).nextTryAt).toEqual(new Date("2026-11-10T07:00:00Z"));
  });
  it("stops trying a row noted more than 7 days ago", () => {
    expect(tooOld(new Date(T0.getTime() - 7 * 24 * H), T0)).toBe(false);
    expect(tooOld(new Date(T0.getTime() - 7 * 24 * H - 1), T0)).toBe(true);
  });
  it("refuses nonsense", () => {
    expect(nextTryAt(0, T0)).toBeNull();
    expect(nextTryAt(1.5, T0)).toBeNull();
  });
});

describe("after a try", () => {
  it("stops for good when it went, was skipped on purpose, has nothing left to send, or may have gone", () => {
    for (const r of ["sent", "skipped", "gone", "unknown"] as const) expect(afterTry(2, r, T0)).toEqual({ status: r, tries: 3, nextTryAt: null });
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
  const handlers = (fn: (r: Row, signal: AbortSignal) => Promise<"sent" | "skipped" | "gone" | "busy">) => ({ donation_confirmation: fn, s18a_receipt: fn, monthly_declined: fn });

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
    // The result is written only on the row this run claimed.
    expect(f.tokens.a).toBe("t-a");
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
        // The email service answered and refused it: sure not to have gone, so it is tried again.
        throw new EmailError("timeout talking to sipho@example.test");
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

  it("starts no new send within 12 seconds of the deadline: one send must fit", async () => {
    let t = 1_000_000;
    const f = fakeStore([row("a"), row("b")]);
    const send = vi.fn(async () => ((t += 5_000), "sent" as const));
    // 20 seconds left: "a" starts (and takes 5 seconds), then "b" with 15 left. With 11 left, nothing starts.
    const s = await runEmailRetries({ store: f.store, handlers: handlers(send), now: T0, deadline: t + 20_000, emailOn: true, clock: () => t });
    expect(f.claims).toEqual(["a", "b"]);
    const s2 = await runEmailRetries({ store: fakeStore([row("c")]).store, handlers: handlers(send), now: T0, deadline: t + 11_000, emailOn: true, clock: () => t });
    expect(s.incomplete).toBe(false);
    expect(s2).toMatchObject({ incomplete: true, resent: 0 });
  });

  it("never resends a send that was cut off (it may have gone): marks it for a person instead", async () => {
    const f = fakeStore([row("a", { kind: "s18a_receipt" })]);
    const audit = vi.fn(async () => undefined);
    const s = await runEmailRetries({ store: f.store, handlers: handlers(async () => Promise.reject(cutOff())), now: T0, deadline: Infinity, emailOn: true, audit });
    expect(s).toMatchObject({ unknown: 1, failedAgain: 0, gaveUp: 0 });
    expect(f.finished.a).toMatchObject({ status: "unknown", tries: 2, nextTryAt: null });
    expect(audit).toHaveBeenCalledWith("email.retry_unknown", expect.objectContaining({ id: "a" }), expect.objectContaining({ kind: "s18a_receipt", try: 2 }));
    expect(wasCutOff(cutOff())).toBe(true);
    expect(wasCutOff(new EmailError("Resend refused the email (500)."))).toBe(false);
  });

  it("a dropped connection during the send is 'unknown' too: flagged, never resent", async () => {
    // Only the transport says a send may have gone (EmailMaybeSent): it wraps fetch's "fetch failed" and time limits.
    expect(wasCutOff(new EmailMaybeSent("The send to Resend was cut off: fetch failed"))).toBe(true);
    expect(mayHaveSent).toBe(wasCutOff);
    const f = fakeStore([row("a", { kind: "donation_confirmation" })]);
    const audit = vi.fn(async () => undefined);
    const s = await runEmailRetries({ store: f.store, handlers: handlers(async () => Promise.reject(new EmailMaybeSent("fetch failed"))), now: T0, deadline: Infinity, emailOn: true, audit });
    expect(s).toMatchObject({ unknown: 1, failedAgain: 0, resent: 0 });
    expect(f.finished.a).toMatchObject({ status: "unknown", nextTryAt: null });
    expect(audit).toHaveBeenCalledWith("email.retry_unknown", expect.objectContaining({ id: "a" }), expect.anything());
  });

  it("a failure before anything was sent (a database read, a missing setting) is tried again, never left as 'unknown'", async () => {
    // These never reached the email service, so nothing can have gone (review 12/11/2026).
    for (const e of [new Error("database went away"), new Error("SITE_URL is not set"), new TypeError("fetch failed"), Object.assign(new Error("x"), { name: "AbortError" })]) {
      expect(wasCutOff(e)).toBe(false);
    }
    const f = fakeStore([row("a", { kind: "donation_confirmation" }), row("b", { kind: "s18a_receipt" }), row("c", { kind: "monthly_declined" })]);
    const s = await runEmailRetries({ store: f.store, handlers: handlers(async () => Promise.reject(new Error("database went away"))), now: T0, deadline: Infinity, emailOn: true, audit: vi.fn(async () => undefined) });
    expect(s).toMatchObject({ unknown: 0, failedAgain: 3 });
    for (const id of ["a", "b", "c"]) expect(f.finished[id]).toMatchObject({ status: "waiting" });
  });

  it("doesn't send a row taken over from a run that stopped mid-way: that run may have sent it", async () => {
    const f = fakeStore([row("a")], { stale: new Set(["a"]) });
    const send = vi.fn(async () => "sent" as const);
    const audit = vi.fn(async () => undefined);
    const s = await runEmailRetries({ store: f.store, handlers: handlers(send), now: T0, deadline: Infinity, emailOn: true, audit });
    expect(send).not.toHaveBeenCalled();
    expect(s).toMatchObject({ unknown: 1, resent: 0 });
    expect(f.finished.a).toMatchObject({ status: "unknown", nextTryAt: null });
    expect(audit).toHaveBeenCalledWith("email.retry_unknown", expect.anything(), expect.anything());
  });

  it("keeps going when a result can't be written after a real send, and counts the send", async () => {
    const f = fakeStore([row("a"), row("b")], { finishFails: new Set(["a"]) });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const s = await runEmailRetries({ store: f.store, handlers: handlers(async () => "sent"), now: T0, deadline: Infinity, emailOn: true });
    spy.mockRestore();
    // "a" keeps its claim: a later run takes it over as unknown (test above) and never sends it again.
    expect(s.resent).toBe(2);
    expect(Object.keys(f.finished)).toEqual(["b"]);
  });

  it("gives up on a row older than 7 days without trying it, and says so once", async () => {
    const f = fakeStore([row("a", { createdAt: new Date(T0.getTime() - 8 * 24 * H) })]);
    const send = vi.fn(async () => "sent" as const);
    const audit = vi.fn(async () => undefined);
    const s = await runEmailRetries({ store: f.store, handlers: handlers(send), now: T0, deadline: Infinity, emailOn: true, audit });
    expect(send).not.toHaveBeenCalled();
    expect(s).toMatchObject({ expired: 1, gaveUp: 0 });
    expect(f.finished.a).toMatchObject({ status: "gave_up", tries: 1, nextTryAt: null });
    expect(audit).toHaveBeenCalledWith("email.retry_gave_up", expect.anything(), { kind: "donation_confirmation", tries: 1, reason: "too_old" });
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
  it("doesn't go once the card was tried again since: that try's own notice says it", () => {
    const kept = { ...info, failedAttempts: 1 };
    expect(declinedNoticeStillTrue({ status: "active", ended_reason: null, failed_attempts: 1 }, kept, false)).toBe(true);
    expect(declinedNoticeStillTrue({ status: "active", ended_reason: null, failed_attempts: 2 }, kept, false)).toBe(false);
  });
  it("closes an older waiting notice once a newer one went, and only a waiting one", async () => {
    dbCalls.length = 0;
    await markRetryGone("monthly_declined", "rec-1", T0);
    expect(dbCalls).toEqual([
      ["from", "email_retries"],
      ["update", { status: "gone", claimed_at: null, updated_at: T0.toISOString() }],
      ["eq", "kind", "monthly_declined"],
      ["eq", "ref_id", "rec-1"],
      ["eq", "status", "waiting"],
    ]);
  });
  it("reads back only a sane kept notice", () => {
    expect(declinedInfoFrom(info)).toEqual(info);
    expect(declinedInfoFrom({ ...info, failedAttempts: 2 })).toEqual({ ...info, failedAttempts: 2 });
    expect(declinedInfoFrom({ ...info, failedAttempts: 0 })).toBeNull();
    expect(declinedInfoFrom({ ...info, totalCents: 12.5 })).toBeNull();
    expect(declinedInfoFrom({ ...info, final: "yes" })).toBeNull();
    expect(declinedInfoFrom({ ...info, failedAt: "soon" })).toBeNull();
  });
});

describe("older failed confirmations from the audit log", () => {
  it("are put on the list in one write that never resets a row already there", async () => {
    dbCalls.length = 0;
    await recordFailedConfirmations(["d1", "d2"], T0);
    const upserts = dbCalls.filter((c) => c[0] === "upsert");
    expect(upserts).toHaveLength(1);
    expect(upserts[0][1]).toHaveLength(2);
    expect(upserts[0][2]).toEqual({ onConflict: "kind,ref_id", ignoreDuplicates: true });
  });
});

describe("Givezy's daily email", () => {
  const quiet = { incomplete: false, cardUpdatesFinished: 0, pending: { checked: 0, paid: 0, failed: 0, still: 0, errors: 0 }, stuckPending: 0, confirmations: { resent: 0, failedAgain: 0 }, unhandledEvents: 0, held: {} };
  const none = { resent: 0, skipped: 0, gone: 0, failedAgain: 0, gaveUp: 0, expired: 0, unknown: 0 };
  const fine = { monthlyErrors: 0, monthlyReview: 0, monthlyStopped: 0, payoutsFailed: false, monthlyFailed: false };
  it("says nothing about emails that went, were skipped or are still waiting", () => {
    expect(dailyDigest({ ...quiet, emailRetries: { ...none, resent: 3, skipped: 1, gone: 1, failedAgain: 2 } }, fine)).toEqual([]);
  });
  it("tells Givezy once, with a count only, when emails gave up", () => {
    const lines = dailyDigest({ ...quiet, emailRetries: { ...none, gaveUp: 2 } }, fine);
    expect(lines).toEqual(retryDigestLines({ gaveUp: 2, expired: 0, unknown: 0 }));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^2 important emails to donors .* after 3 more tries/);
    expect(lines[0]).not.toMatch(/@/);
  });
  it("names sends that may have gone, and rows too old to try, for a person to check", () => {
    const lines = dailyDigest({ ...quiet, emailRetries: { ...none, unknown: 1, expired: 3 } }, fine);
    expect(lines).toHaveLength(2);
    expect(lines.join(" ")).toMatch(/3 failed emails to donors waited more than 7 days/);
    expect(lines.join(" ")).toMatch(/1 email to donors may or may not have gone .* email\.retry_unknown/);
  });
  it("says so when trying again couldn't run at all, and the rest of the email still goes", () => {
    const lines = dailyDigest({ ...quiet, stuckPending: 1, emailRetries: { ...none, broken: true } }, fine);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/could not run today/);
  });
});
