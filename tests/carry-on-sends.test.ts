/**
 * Unfinished emails to donors carry on by themselves (21/11/2026): the daily job picks up each unfinished monthly
 * thank-you and news email and carries it on with the very same send functions as "Send the rest". Against a small
 * in-memory database, with the real claims and the real one-message-a-week check.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { weekStart } from "@/lib/charity/thank-you";
import { emailHash } from "@/lib/email-fingerprint";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
let seq = 0;

const value = (r: Row, col: string) => {
  if (!col.includes("->>")) return r[col];
  const [c, key] = col.split("->>");
  const v = (r[c] as Row | undefined)?.[key];
  return v == null ? v : String(v);
};
/** Dates compare as dates (the app mixes "+02:00" and "Z"), anything else as text. */
const cmp = (a: unknown, b: unknown) => {
  const x = Date.parse(String(a));
  const y = Date.parse(String(b));
  if (!Number.isNaN(x) && !Number.isNaN(y)) return x - y;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
};

function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  const sorts: { col: string; asc: boolean }[] = [];
  let slice: [number, number] | null = null;
  let lim = Infinity;
  let op: { kind: "select" } | { kind: "update"; set: Row } | { kind: "delete" } | { kind: "insert"; rows: Row[] } | { kind: "upsert"; rows: Row[]; conflict: string[] } = { kind: "select" };
  const list = () => (tables[table] ??= []);
  const matching = () => list().filter((r) => filters.every((f) => f(r)));
  const run = (): { data: Row[] | null; error: { code: string; message: string } | null } => {
    if (op.kind === "update") {
      const hit = matching();
      for (const r of hit) Object.assign(r, op.set);
      return { data: hit, error: null };
    }
    if (op.kind === "delete") {
      const gone = new Set(matching());
      tables[table] = list().filter((r) => !gone.has(r));
      return { data: [...gone], error: null };
    }
    if (op.kind === "insert") {
      for (const n of op.rows) list().push({ id: `${table}-${++seq}`, ...n });
      return { data: op.rows, error: null };
    }
    if (op.kind === "upsert") {
      const added: Row[] = [];
      for (const n of op.rows) {
        if (list().some((r) => (op as { conflict: string[] }).conflict.every((c) => r[c] === n[c]))) continue;
        // The database's defaults for a claimed thank-you address.
        const row = { status: "sending", claimed_at: new Date().toISOString(), ...n };
        list().push(row);
        added.push(row);
      }
      return { data: added, error: null };
    }
    let out = matching();
    if (sorts.length) out = [...out].sort((a, b) => sorts.reduce((acc, s) => acc || cmp(a[s.col], b[s.col]) * (s.asc ? 1 : -1), 0));
    out = slice ? out.slice(slice[0], slice[1] + 1) : out;
    return { data: out.slice(0, lim), error: null };
  };
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (c: string, v: unknown) => (filters.push((r) => value(r, c) === v), q),
    neq: (c: string, v: unknown) => (filters.push((r) => value(r, c) !== v), q),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(value(r, c))), q),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
    gte: (c: string, v: string) => (filters.push((r) => r[c] != null && cmp(r[c], v) >= 0), q),
    lt: (c: string, v: string) => (filters.push((r) => r[c] != null && cmp(r[c], v) < 0), q),
    order: (col: string, o?: { ascending?: boolean }) => (sorts.push({ col, asc: o?.ascending !== false }), q),
    limit: (n: number) => ((lim = n), q),
    range: (a: number, b: number) => ((slice = [a, b]), q),
    update: (set: Row) => ((op = { kind: "update", set }), q),
    delete: () => ((op = { kind: "delete" }), q),
    insert: (rows: Row | Row[]) => ((op = { kind: "insert", rows: Array.isArray(rows) ? rows : [rows] }), q),
    upsert: (rows: Row | Row[], o: { onConflict: string }) => ((op = { kind: "upsert", rows: Array.isArray(rows) ? rows : [rows], conflict: o.onConflict.split(",") }), q),
    single: async () => ({ data: run().data?.[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
  };
  return q;
}

/** Hands out waiting appeal recipients, marking them "sending", as the database function does. */
async function rpc(_name: string, args: { p_appeal_id: string; p_limit: number }) {
  const rows = (tables.charity_appeal_recipients ?? []).filter((r) => r.appeal_id === args.p_appeal_id && r.status === "waiting").slice(0, args.p_limit);
  for (const r of rows) Object.assign(r, { status: "sending", claimed_at: new Date().toISOString() });
  return { data: rows.map((r) => ({ donor_id: r.donor_id })), error: null };
}

const sent: { to: string; subject: string; signal?: AbortSignal }[] = [];
/** The email service says "too many, slow down" (429) to every email: nothing goes. */
let refuseAll = false;
const donorList = ["ann", "ben", "cat"].map((id) => ({ donor_id: id, donor_type: "individual", display_name: id, email: `${id}@x.co` }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from, rpc }) }));
// The audit log is the job's memory of earlier runs: kept in the in-memory database, newest last.
vi.mock("@/lib/audit", () => ({
  logAudit: async (e: { actorUserId: string | null; action: string; entityType: string; entityId?: string | null; details?: Row }) => {
    (tables.audit_log ??= []).push({ actor_user_id: e.actorUserId, action: e.action, entity_type: e.entityType, entity_id: e.entityId ?? null, details: e.details ?? {}, created_at: new Date(Date.now() + ++seq * 1000).toISOString() });
  },
}));
/** The dashboard's donor list needs a signed-in team member: the daily job has none, and the database refuses it. */
let signedIn = true;
vi.mock("@/lib/charity/dashboard-queries", () => ({
  loadDonors: async () => {
    if (!signedIn) throw new Error("permission denied for function charity_donor_list");
    return donorList;
  },
}));
vi.mock("@/lib/charity/donor-care", () => ({ lapsedDaysFor: async () => 365, listSegments: async () => [], listTags: async () => [], tagsByDonor: async () => new Map() }));
vi.mock("@/lib/auth", () => ({ getViewer: async () => null }));
vi.mock("@/lib/email", () => {
  class EmailError extends Error {
    constructor(message: string, readonly status?: number) {
      super(message);
    }
  }
  class EmailMaybeSent extends Error {}
  return {
    EmailError,
    EmailMaybeSent,
    isTemporaryRefusal: (e: unknown) => e instanceof EmailError && (e.status === 429 || (e.status ?? 0) >= 500),
    getEmailTransport: () => ({
      name: "resend",
      send: async (m: { to: string; subject: string; signal?: AbortSignal }) => {
        if (refuseAll) throw new EmailError("Resend refused the email (429).", 429);
        sent.push({ to: m.to, subject: m.subject, signal: m.signal });
        return "sent";
      },
    }),
  };
});

const { carryOnSends, readHistory, supabaseCarryOnStore, GIVE_UP_AFTER, MIN_SHARE_MS } = await import("@/lib/charity/carry-on-sends");
const { sendAppeal } = await import("@/lib/charity/appeals");

const C = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-11-12T08:00:00+02:00");
const MONTH = "2026-10-01";
const on = () => true;
const job = (deadlineMs = 30_000) => carryOnSends(Date.now() + deadlineMs, { store: supabaseCarryOnStore(), emailOn: on });
const to = () => sent.map((m) => m.to).sort();

/** A monthly thank-you to ann, ben and cat that stopped after ann (and a "sending" left for ben, which may have gone, when asked). */
function unfinishedThankYou(opts: { benMayHaveGone?: boolean } = {}) {
  tables.charity_thank_yous = [{ id: "t1", charity_id: C, period_month: MONTH, body: "Thank you, truly.", sent_by: OWNER, sent_at: "2026-11-11T10:00:00+02:00", finished_at: null, recipient_count: 1 }];
  tables.charity_thank_you_recipients = [
    { thank_you_id: "t1", email_hash: emailHash("ann@x.co"), status: "sent", claimed_at: "2026-11-02T10:00:00+02:00" },
    ...(opts.benMayHaveGone ? [{ thank_you_id: "t1", email_hash: emailHash("ben@x.co"), status: "sending", claimed_at: "2026-11-02T10:00:00+02:00" }] : []),
  ];
}
/** A news email to ann, ben and cat that stopped after ann. */
function unfinishedAppeal() {
  tables.charity_appeals = [{ id: "a1", charity_id: C, subject: "Winter parcels", body: "Thank you for helping.", created_by: OWNER, created_at: "2026-11-11T10:00:00+02:00" }];
  tables.charity_appeal_recipients = [
    { appeal_id: "a1", charity_id: C, donor_id: "ann", status: "sent", claimed_at: "2026-11-02T10:00:00+02:00" },
    { appeal_id: "a1", charity_id: C, donor_id: "ben", status: "waiting" },
    { appeal_id: "a1", charity_id: C, donor_id: "cat", status: "waiting" },
  ];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  sent.length = 0;
  refuseAll = false;
  seq = 0;
  process.env.SITE_URL = "https://g.test";
  tables = {
    charities: [{ id: C, status: "approved", name_en: "Meals Fund" }],
    charity_private: [{ charity_id: C, contact_email: "hello@meals.org" }],
    charity_admins: [{ charity_id: C, user_id: OWNER, role: "owner" }],
    profiles: [{ id: OWNER, role: "donor" }],
    donors: donorList.map((d) => ({ id: d.donor_id, email: d.email })),
    donations: donorList.map((d) => ({
      id: `g-${d.donor_id}`, charity_id: C, donor_id: d.donor_id, status: "paid", gateway: "card", paid_at: "2026-10-05T10:00:00+02:00",
      donation_checkout_details: { email: d.email, first_name: d.donor_id, erased_at: null },
    })),
    charity_thank_yous: [],
    charity_thank_you_recipients: [],
    charity_appeals: [],
    charity_appeal_recipients: [],
    charity_donor_thanks: [],
    charity_email_opt_outs: [],
    thank_you_opt_outs: [],
    audit_log: [],
  };
});

describe("the daily job carries on unfinished emails to donors", () => {
  it("finishes a thank-you that stopped part way, with the same words, and marks it finished", async () => {
    unfinishedThankYou();
    const r = await job();
    expect(to()).toEqual(["ben@x.co", "cat@x.co"]);
    expect(r).toMatchObject({ unfinished: 1, continued: 1, sent: 2, finished: 1 });
    expect(tables.charity_thank_yous[0].finished_at).toBeTruthy();
    // Recorded like every send, as the job's (no person), so the charity's history and the audit log show it.
    expect(tables.audit_log.at(-1)).toMatchObject({ actor_user_id: null, action: "charity.thank_you_sent", details: { month: MONTH, sentThisRun: 2, auto: true } });
    // Finished: tomorrow's job has nothing to do.
    sent.length = 0;
    expect(await job()).toMatchObject({ unfinished: 0, sent: 0 });
  });

  it("finishes a news email that stopped part way, with no signed-in person (review 21/11/2026)", async () => {
    unfinishedAppeal();
    // As on the hosted site: the job has no session, so the dashboard's donor list refuses it. Before the fix, the
    // job claimed donors, failed to read them, and left them "sending" for good.
    signedIn = false;
    const r = await job().finally(() => (signedIn = true));
    expect(to()).toEqual(["ben@x.co", "cat@x.co"]);
    expect(r).toMatchObject({ unfinished: 1, continued: 1, sent: 2, finished: 1 });
    expect(tables.charity_appeal_recipients.map((x) => x.status)).toEqual(["sent", "sent", "sent"]);
  });

  it("each email the job sends has its 8-second limit, so a slow email service can't hold up the day's job (review 21/11/2026)", async () => {
    unfinishedThankYou();
    unfinishedAppeal();
    await job();
    expect(sent.length).toBeGreaterThan(0);
    for (const m of sent) expect(m.signal).toBeInstanceOf(AbortSignal);
  });

  it("a donor whose gift was refunded in full in part refunds gets no news email from the job: a refund, not a gift (21/11/2026)", async () => {
    unfinishedAppeal();
    tables.donations = tables.donations.map((g) => (g.donor_id === "cat" ? { ...g, amount_cents: 10_000, refunded_cents: 10_000 } : { ...g, amount_cents: 10_000, refunded_cents: 0 }));
    await job();
    expect(to()).toEqual(["ben@x.co"]);
    expect(Object.fromEntries(tables.charity_appeal_recipients.map((x) => [x.donor_id, x.status]))).toMatchObject({ ben: "sent", cat: "skipped" });
  });

  it("a donor who gave again since a 'gave last year, not since' or lapsed email was made is left off it, and a plain email is not affected (review 23/11/2026)", async () => {
    for (const value of ["keeping:lybunt", "group:lapsed"]) {
      unfinishedAppeal();
      tables.charity_appeals[0].audience = { value };
      // Ben gave again this morning, after the email was made on 11/11.
      tables.donations.push({ id: "g-ben-new", charity_id: C, donor_id: "ben", status: "paid", gateway: "card", paid_at: "2026-11-12T07:00:00+02:00", amount_cents: 5000, refunded_cents: 0, donation_checkout_details: { email: "ben@x.co", first_name: "ben", erased_at: null } });
      sent.length = 0;
      await job();
      expect(to()).toEqual(["cat@x.co"]);
      expect(Object.fromEntries(tables.charity_appeal_recipients.map((x) => [x.donor_id, x.status]))).toMatchObject({ ben: "skipped", cat: "sent" });
      tables.donations = tables.donations.filter((g) => g.id !== "g-ben-new");
    }
    // The same gift does not stop an email to everyone.
    unfinishedAppeal();
    tables.charity_appeals[0].audience = { value: "all" };
    tables.donations.push({ id: "g-ben-new", charity_id: C, donor_id: "ben", status: "paid", gateway: "card", paid_at: "2026-11-12T07:00:00+02:00", amount_cents: 5000, refunded_cents: 0, donation_checkout_details: { email: "ben@x.co", first_name: "ben", erased_at: null } });
    sent.length = 0;
    await job();
    expect(to()).toEqual(["ben@x.co", "cat@x.co"]);
  });

  it("never emails a claimed address again, even one whose send may have gone", async () => {
    unfinishedThankYou({ benMayHaveGone: true });
    await job();
    expect(to()).toEqual(["cat@x.co"]);
    // A second run the same day sends nothing more.
    sent.length = 0;
    await job();
    expect(sent).toEqual([]);
  });

  it("keeps the one-message-a-week rule: someone messaged this week waits, and the thank-you stays open for them", async () => {
    unfinishedThankYou();
    tables.charity_donor_thanks = [{ charity_id: C, donor_id: "cat", week_start: weekStart(NOW) }];
    const r = await job();
    expect(to()).toEqual(["ben@x.co"]);
    expect(r).toMatchObject({ sent: 1, finished: 0 });
    expect(tables.charity_thank_yous[0].finished_at).toBeNull();

    sent.length = 0;
    unfinishedAppeal();
    await job();
    // The same week, the news email reaches nobody new: ben just had the thank-you and cat a personal thank-you.
    // Both are left out of it (as "Send the rest" does); the thank-you still waits for cat.
    expect(sent).toEqual([]);
    expect(tables.charity_appeal_recipients.map((x) => x.status)).toEqual(["sent", "skipped", "skipped"]);
    expect(tables.charity_thank_yous[0].finished_at).toBeNull();
    // From Monday cat's week has passed: the job reaches cat by itself, and the thank-you is finished.
    vi.setSystemTime(new Date("2026-11-16T08:00:00+02:00"));
    expect(await job()).toMatchObject({ unfinished: 1, sent: 1, finished: 1 });
    expect(to()).toEqual(["cat@x.co"]);
  });

  it("does nothing while email is switched off on the site", async () => {
    unfinishedThankYou();
    unfinishedAppeal();
    const r = await carryOnSends(Date.now() + 30_000, { store: supabaseCarryOnStore(), emailOn: () => false });
    expect(r).toMatchObject({ emailOff: true, unfinished: 0, continued: 0 });
    expect(sent).toEqual([]);
  });

  it("only carries on what a person started, while the page is live and they may still email donors", async () => {
    unfinishedAppeal();
    tables.charities[0].status = "suspended";
    expect(await job()).toMatchObject({ unfinished: 1, notAllowed: 1, continued: 0 });
    tables.charities[0].status = "approved";
    // Moved to a role that doesn't email donors.
    tables.charity_admins[0].role = "finance";
    expect(await job()).toMatchObject({ notAllowed: 1, continued: 0 });
    // Removed from the team.
    tables.charity_admins = [];
    expect(await job()).toMatchObject({ notAllowed: 1, continued: 0 });
    expect(sent).toEqual([]);
    // Back as a fundraiser: it carries on.
    tables.charity_admins = [{ charity_id: C, user_id: OWNER, role: "fundraiser" }];
    expect(await job()).toMatchObject({ continued: 1, sent: 2 });
  });

  it("leaves old sends alone, and a finished one or one with nobody waiting is not picked up", async () => {
    unfinishedAppeal();
    tables.charity_appeals[0].created_at = "2026-10-20T10:00:00+02:00";
    tables.charity_thank_yous = [{ id: "t2", charity_id: C, period_month: MONTH, body: "Thanks.", sent_by: OWNER, sent_at: "2026-11-10T10:00:00+02:00", finished_at: "2026-11-10T10:01:00+02:00" }];
    expect(await job()).toMatchObject({ unfinished: 0 });
    expect(sent).toEqual([]);
  });

  it("starts nothing when its time is too short, and says how many wait for tomorrow", async () => {
    unfinishedThankYou();
    unfinishedAppeal();
    const r = await job(MIN_SHARE_MS - 1);
    expect(r).toMatchObject({ unfinished: 2, continued: 0, notReached: 2 });
    expect(sent).toEqual([]);
  });

  it("a send the email service keeps refusing is left for a person after the usual tries, once, and a person's press starts it again", async () => {
    unfinishedAppeal();
    refuseAll = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (let day = 1; day <= GIVE_UP_AFTER; day++) {
      const r = await job();
      expect(r).toMatchObject({ continued: 1, sent: 0, leftForPerson: day === GIVE_UP_AFTER ? 1 : 0 });
    }
    // Nothing was lost: everyone not sent is still waiting.
    expect(tables.charity_appeal_recipients.filter((x) => x.status === "waiting")).toHaveLength(2);
    // Counted once: the next day it is waiting for a person, not tried again and not counted again.
    expect(await job()).toMatchObject({ continued: 0, leftForPerson: 0, waitingForPerson: 1 });
    expect(tables.audit_log.filter((x) => x.action === "charity.send_left_for_person")).toHaveLength(1);
    // Someone presses Send the rest once email works: the job carries it on again from then on.
    refuseAll = false;
    await sendAppeal({ charityId: C, appealId: "a1", charityName: "Meals Fund", replyTo: null, userId: OWNER, budgetMs: 0 });
    expect(await job()).toMatchObject({ continued: 1, sent: 2, finished: 1, waitingForPerson: 0 });
    vi.mocked(console.error).mockRestore();
  });
});

describe("sharing the job's time", () => {
  const send = (i: number) => ({ kind: "appeal" as const, id: `a${i}`, charityId: C, startedBy: OWNER, startedAt: `2026-11-1${i}T10:00:00+02:00` });
  const store = (n: number) => ({
    unfinished: async () => Array.from({ length: n }, (_, i) => send(i)),
    sender: async () => ({ charityName: "Meals Fund", replyTo: null }),
    history: async () => [],
    leaveForPerson: async () => undefined,
  });

  it("gives each send an equal share of what is left, never past the deadline, and leaves the rest for tomorrow", async () => {
    let clock = 0;
    const budgets: number[] = [];
    const appeal = async (a: { budgetMs?: number }) => {
      budgets.push(a.budgetMs!);
      clock += a.budgetMs!; // Each send uses all of its share.
      return { sent: 1, failed: 0, skipped: 0, waiting: 5, sentThisRun: 1 };
    };
    const r = await carryOnSends(30_000, { store: store(3), emailOn: on, now: () => clock, runners: { thankYou: async () => ({ ok: false, message: "" }), appeal } });
    expect(budgets.length).toBe(3);
    expect(budgets.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(30_000);
    expect(budgets[0]).toBeLessThanOrEqual(10_000);
    expect(r).toMatchObject({ continued: 3, sent: 3, finished: 0 });

    // Not enough time for everyone: those not reached are counted, and tomorrow starts further along the list.
    clock = 0;
    budgets.length = 0;
    const tight = await carryOnSends(9_000, { store: store(3), emailOn: on, now: () => clock, runners: { thankYou: async () => ({ ok: false, message: "" }), appeal } });
    expect(tight.continued + tight.notReached).toBe(3);
    expect(tight.notReached).toBeGreaterThan(0);
  });

  it("a send that throws is counted and the others still carry on", async () => {
    let n = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const appeal = async () => {
      if (n++ === 0) throw new Error("database down");
      return { sent: 1, failed: 0, skipped: 0, waiting: 0, sentThisRun: 1 };
    };
    const r = await carryOnSends(Date.now() + 30_000, { store: store(2), emailOn: on, runners: { thankYou: async () => ({ ok: false, message: "" }), appeal } });
    expect(r).toMatchObject({ errors: 1, continued: 1, finished: 1 });
    vi.mocked(console.error).mockRestore();
  });
});

describe("reading a send's history", () => {
  it("counts the job's refused runs in a row, back to a person's press or a run that sent something", () => {
    const refused = { by: "job" as const, refusedWithNothingSent: true };
    expect(readHistory([])).toEqual({ refusedRuns: 0, left: false });
    expect(readHistory([refused, refused, { by: "person" }, refused])).toEqual({ refusedRuns: 2, left: false });
    expect(readHistory([refused, { by: "job", refusedWithNothingSent: false }, refused])).toEqual({ refusedRuns: 1, left: false });
    expect(readHistory([{ by: "left" }, refused])).toEqual({ refusedRuns: 0, left: true });
    expect(readHistory([{ by: "person" }, { by: "left" }])).toEqual({ refusedRuns: 0, left: false });
  });
});

describe("what the charity's page says about the rest (review 21/11/2026)", () => {
  it("only says they go out by themselves when the job really carries them on, and never promises a time", async () => {
    const { carryOnStateFrom, carryOnLine, CARRY_ON_DAYS } = await import("@/lib/charity/carry-on-sends");
    const base = { startedAt: "2026-11-10T10:00:00+02:00", emailOn: true, pageLive: true, senderAllowed: true, history: [], now: NOW };
    expect(carryOnStateFrom(base)).toBe("goes");
    expect(carryOnLine("goes", { owner: true })).toBe("The rest keep going out by themselves each day. You can also press Send the rest now.");
    expect(carryOnStateFrom({ ...base, emailOn: false })).toBe("email_off");
    expect(carryOnStateFrom({ ...base, startedAt: new Date(NOW.getTime() - (CARRY_ON_DAYS + 1) * 86_400_000).toISOString() })).toBe("too_old");
    expect(carryOnStateFrom({ ...base, pageLive: false })).toBe("page_not_live");
    expect(carryOnStateFrom({ ...base, senderAllowed: false })).toBe("sender_left");
    expect(carryOnStateFrom({ ...base, history: [{ by: "left" }] })).toBe("left_for_person");
    // Refused the most times in a row: the job leaves it for a person on its next run.
    expect(carryOnStateFrom({ ...base, history: Array.from({ length: GIVE_UP_AFTER }, () => ({ by: "job" as const, refusedWithNothingSent: true })) })).toBe("left_for_person");
    // A person pressing Send the rest since lifts it again.
    expect(carryOnStateFrom({ ...base, history: [{ by: "person" }, { by: "left" }] })).toBe("goes");
    for (const s of ["too_old", "sender_left", "left_for_person"] as const) {
      expect(carryOnLine(s, { owner: true })).toMatch(/Press Send the rest/);
      expect(carryOnLine(s, { owner: false })).toMatch(/can press Send the rest/);
    }
    expect(carryOnLine("left_for_person", { owner: true })).toMatch(/email service refused/);
    expect(carryOnLine("too_old", { owner: true })).toMatch(/more than 14 days ago/);
    for (const s of ["goes", "email_off", "too_old", "page_not_live", "sender_left", "left_for_person"] as const) {
      const line = carryOnLine(s, { owner: true });
      expect(line).not.toMatch(/day or two|!|—/);
    }
  });

  it("reads the sender and the history as the job does", async () => {
    const { carryOnState } = await import("@/lib/charity/carry-on-sends");
    unfinishedThankYou();
    const send = { kind: "thank_you" as const, id: "t1", charityId: C, startedBy: OWNER, startedAt: "2026-11-11T10:00:00+02:00", month: MONTH };
    expect(await carryOnState(send, { pageLive: true, emailOn: on, now: NOW })).toBe("goes");
    // Whoever pressed Send has left the team: the job skips it, so the page says so.
    tables.charity_admins = [];
    expect(await carryOnState(send, { pageLive: true, emailOn: on, now: NOW })).toBe("sender_left");
    expect(await carryOnState({ ...send, startedBy: null }, { pageLive: true, emailOn: on, now: NOW })).toBe("sender_left");
    expect(await carryOnState(send, { pageLive: true, emailOn: () => false, now: NOW })).toBe("email_off");
  });
});
