/**
 * Review fixes (12/11/2026), against a small in-memory stand-in for the database that, like the real one, never
 * answers more than 1 000 rows at a time:
 * - one inbox gets an appeal or a journey email once, even when the person is two donors (themselves and their company);
 * - an appeal send that may have gone (a dropped connection) stays "sending", never marked failed or sent again;
 * - the journey's "already gave before it was switched on" check reads every page, so a long-standing donor is never
 *   enrolled as new because another donor's many gifts filled the read.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
let nextId = 1;
const MAX_ROWS = 1000;
const UNIQUE: Record<string, string[]> = {
  charity_donor_thanks: ["charity_id", "donor_id", "week_start"],
  charity_journey_sends: ["enrolment_id", "position"],
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
      for (const r of hit) Object.assign(r, (op as { set: Row }).set);
      return { data: hit, error: null };
    }
    if (op.kind === "delete") {
      const gone = new Set(matching());
      tables[table] = list().filter((r) => !gone.has(r));
      return { data: [...gone], error: null };
    }
    if (op.kind === "insert") {
      const added: Row[] = [];
      for (const n of op.rows) {
        const keys = UNIQUE[table];
        if (keys && list().some((r) => keys.every((k) => r[k] === n[k]))) return { data: null, error: { code: "23505", message: "duplicate" } };
        const row = { id: `${table}-${nextId++}`, ...n };
        list().push(row);
        added.push(row);
      }
      return { data: added, error: null };
    }
    if (op.kind === "upsert") {
      const added: Row[] = [];
      for (const n of op.rows) {
        const conflict = (op as { conflict: string[] }).conflict;
        if (list().some((r) => conflict.every((c) => r[c] === n[c]))) continue;
        const row = { id: `${table}-${nextId++}`, status: "active", ...n };
        list().push(row);
        added.push(row);
      }
      return { data: added, error: null };
    }
    let out = matching();
    if (sorts.length) {
      out = [...out].sort((a, b) => {
        for (const { col, asc } of sorts) {
          const c = String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0;
          if (c) return c * (asc ? 1 : -1);
        }
        return 0;
      });
    }
    if (table === "charity_journeys") out = out.map((r) => ({ ...r, charities: { status: "approved", name_en: "Meals Fund", slug: "meals" } }));
    out = slice ? out.slice(slice[0], slice[1] + 1) : out;
    return { data: out.slice(0, Math.min(lim, MAX_ROWS)), error: null };
  };
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
    neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
    not: (c: string) => (filters.push((r) => r[c] != null), q),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
    gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), q),
    gt: (c: string, v: string) => (filters.push((r) => String(r[c]) > v), q),
    lte: (c: string, v: string) => (filters.push((r) => String(r[c]) <= v), q),
    lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), q),
    order: (col: string, o?: { ascending?: boolean }) => (sorts.push({ col, asc: o?.ascending !== false }), q),
    limit: (n: number) => ((lim = n), q),
    range: (a: number, b: number) => ((slice = [a, b]), q),
    update: (set: Row) => ((op = { kind: "update", set }), q),
    delete: () => ((op = { kind: "delete" }), q),
    insert: (rows: Row | Row[]) => ((op = { kind: "insert", rows: Array.isArray(rows) ? rows : [rows] }), q),
    upsert: (rows: Row | Row[], o: { onConflict: string }) => ((op = { kind: "upsert", rows: Array.isArray(rows) ? rows : [rows], conflict: o.onConflict.split(",") }), q),
    single: async () => {
      const r = run();
      return r.error ? { data: null, error: r.error } : { data: r.data?.[0] ?? null, error: null };
    },
    maybeSingle: async () => {
      const r = run();
      return { data: r.data?.[0] ?? null, error: r.error };
    },
    then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
  };
  return q;
}

/** Hands out waiting appeal recipients, marking them "sending", as the database function does. */
async function rpc(name: string, args: { p_appeal_id: string; p_limit: number }) {
  if (name !== "claim_appeal_recipients") return { data: null, error: { code: "42883", message: `no ${name}` } };
  const rows = (tables.charity_appeal_recipients ?? []).filter((r) => r.appeal_id === args.p_appeal_id && r.status === "waiting").slice(0, args.p_limit);
  for (const r of rows) Object.assign(r, { status: "sending", claimed_at: new Date().toISOString() });
  return { data: rows.map((r) => ({ donor_id: r.donor_id })), error: null };
}

const sent: { to: string; subject: string }[] = [];
/** Addresses whose send throws as a dropped connection would (fetch's "fetch failed"). */
let dropFor = new Set<string>();
let donorList: Row[] = [];

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from, rpc }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from, rpc }) }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => undefined }));
vi.mock("@/lib/charity/charity-actions", () => ({ recordAction: async () => "act1" }));
vi.mock("@/lib/charity/weekly-limit", () => ({ WEEKLY_LIMIT: "One a week.", messagedThisWeek: async () => new Set<string>() }));
vi.mock("@/lib/charity/dashboard-queries", () => ({ loadDonors: async () => donorList }));
vi.mock("@/lib/charity/donor-care", () => ({ lapsedDaysFor: async () => 365, listSegments: async () => [], listTags: async () => [], tagsByDonor: async () => new Map() }));
vi.mock("@/lib/email", () => {
  class EmailError extends Error {}
  return {
    EmailError,
    getEmailTransport: () => ({
      name: "resend",
      send: async (m: { to: string; subject: string }) => {
        if (dropFor.has(m.to.toLowerCase())) throw new TypeError("fetch failed");
        sent.push({ to: m.to, subject: m.subject });
        return "sent";
      },
    }),
  };
});

const { pickAudience, createAppeal, sendAppeal } = await import("@/lib/charity/appeals");
const { runJourneys } = await import("@/lib/charity/journey-store");
const { forgetJourneysV2 } = await import("@/lib/charity/journey-write");

const C = "11111111-1111-4111-8111-111111111111";
const J = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = new Date("2026-11-12T08:00:00+02:00");

const details = (email: string, over: Row = {}) => ({ email, first_name: "Sarah", donor_type: "individual", contact_person: null, erased_at: null, ...over });
const gift = (id: string, donor_id: string, paid_at: string, email: string, over: Row = {}) => ({
  id, charity_id: C, donor_id, status: "paid", gateway: "card", campaign_id: null, paid_at, donation_checkout_details: details(email), ...over,
});
const donor = (donor_id: string, email: string, donor_type = "individual") => ({ donor_id, donor_type, display_name: donor_id, email, phone: null, donation_count: 1, total_cents: 10_000, first_paid_at: "2026-10-01T10:00:00+02:00", last_paid_at: "2026-10-01T10:00:00+02:00", wants_18a: false, is_anonymous: false });

beforeEach(() => {
  sent.length = 0;
  dropFor = new Set();
  nextId = 1;
  forgetJourneysV2();
  process.env.SITE_URL = "https://g.test";
  tables = { donations: [], charity_email_opt_outs: [], thank_you_opt_outs: [] };
  donorList = [];
});

describe("an appeal reaches each inbox once", () => {
  it("someone who is two donors (themselves and their company) is on the list once", async () => {
    donorList = [donor("sarah", "sarah@x.co"), donor("sarah-co", " SARAH@x.co ", "company"), donor("ben", "ben@x.co")];
    tables.donations.push(gift("g1", "sarah", "2026-10-01T10:00:00+02:00", "sarah@x.co"), gift("g2", "sarah-co", "2026-10-02T10:00:00+02:00", "SARAH@x.co"), gift("g3", "ben", "2026-10-03T10:00:00+02:00", "ben@x.co"));
    const pick = await pickAudience(C, { kind: "all" }, NOW);
    expect(pick?.donors.map((d) => d.donor_id)).toEqual(["sarah", "ben"]);
  });

  it("an older list with both of them still sends once; a dropped connection leaves that donor 'sending', never failed or resent", async () => {
    donorList = [donor("sarah", "sarah@x.co"), donor("sarah-co", "Sarah@X.co", "company"), donor("ben", "ben@x.co")];
    tables.charity_appeals = [];
    tables.charity_appeal_recipients = [];
    const id = await createAppeal({ charityId: C, userId: "u1", subject: "Winter parcels", body: "Thank you for helping.", audience: { kind: "all" }, pick: { donors: donorList as never, stopped: 0, thisWeek: 0, recordedOnly: 0, label: "All your donors" } });
    for (const r of tables.charity_appeal_recipients) r.status = "waiting";
    dropFor = new Set(["ben@x.co"]);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const p = await sendAppeal({ charityId: C, appealId: id, charityName: "Meals Fund", replyTo: null, userId: "u1" });
    err.mockRestore();
    expect(sent.map((m) => m.to)).toEqual(["sarah@x.co"]);
    const status = Object.fromEntries(tables.charity_appeal_recipients.map((r) => [r.donor_id, r.status]));
    expect(status).toEqual({ sarah: "sent", "sarah-co": "skipped", ben: "sending" });
    // "sending" counts as not sent on the page, and is never claimed again by "Send the rest".
    expect(p).toMatchObject({ sent: 1, skipped: 1, failed: 1, waiting: 0 });
  });
});

describe("a journey email reaches each inbox once a run", () => {
  const steps = [1, 2].map((position) => ({ id: `s${position}`, journey_id: J, charity_id: C, position, subject: `Email ${position}`, body: "Thank you for your gift.", wait_days: 7 }));
  const enrol = (id: string, donor_id: string) => ({ id, charity_id: C, journey_id: J, donor_id, status: "active", next_step: 1, attempts: 0, next_due_at: "2026-11-11T08:00:00+02:00", enrolled_at: "2026-11-05T08:00:00+02:00" });

  it("the second place of the same address waits a week instead of a second email", async () => {
    tables.charity_journeys = [{ id: J, kind: "general", campaign_id: null, charity_id: C, enabled: true, switched_on_at: "2026-11-01T00:00:00+02:00" }];
    tables.charity_journey_steps = steps;
    tables.charity_journey_enrolments = [enrol("e1", "sarah"), enrol("e2", "sarah-co"), enrol("e3", "ben")];
    tables.donations.push(
      gift("g1", "sarah", "2026-11-05T08:00:00+02:00", "sarah@x.co"),
      gift("g2", "sarah-co", "2026-11-05T09:00:00+02:00", "Sarah@X.co", { donation_checkout_details: details("Sarah@X.co", { donor_type: "company", contact_person: "Sarah Cohen" }) }),
      gift("g3", "ben", "2026-11-05T10:00:00+02:00", "ben@x.co"),
    );
    const run = await runJourneys(NOW, Date.now() + 10_000);
    expect(sent.map((m) => m.to).sort()).toEqual(["ben@x.co", "sarah@x.co"]);
    expect(run).toMatchObject({ sent: 2, waiting: 1 });
    const e2 = tables.charity_journey_enrolments.find((e) => e.id === "e2")!;
    expect(e2).toMatchObject({ status: "active", next_step: 1 });
    // From the next Monday, as any second message in a week.
    expect(new Date(String(e2.next_due_at)).getTime()).toBe(new Date("2026-11-16T00:00:00+02:00").getTime());
  });

  it("a long-standing donor is never enrolled as new because another donor's many gifts filled the read", async () => {
    tables.charity_journeys = [{ id: J, kind: "general", campaign_id: null, charity_id: C, enabled: true, switched_on_at: "2026-11-01T00:00:00+02:00" }];
    tables.charity_journey_steps = steps;
    tables.charity_journey_enrolments = [];
    // "big" gave 1 500 times before the journey was switched on, "old" once; both gave again after it.
    for (let i = 0; i < 1500; i++) tables.donations.push(gift(`a${String(i).padStart(4, "0")}`, "big", "2026-06-01T10:00:00+02:00", "big@x.co"));
    tables.donations.push(gift("z-old-1", "old", "2026-05-01T10:00:00+02:00", "old@x.co"));
    tables.donations.push(gift("n1", "big", "2026-11-06T10:00:00+02:00", "big@x.co"), gift("n2", "old", "2026-11-07T10:00:00+02:00", "old@x.co"), gift("n3", "new", "2026-11-08T10:00:00+02:00", "new@x.co"));
    await runJourneys(NOW, Date.now() + 10_000);
    expect(tables.charity_journey_enrolments.map((e) => e.donor_id)).toEqual(["new"]);
  });
});
