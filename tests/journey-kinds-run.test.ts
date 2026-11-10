/**
 * The daily run with campaign and win-back journeys (CRM steps 6b and 7, 10/11/2026), against a small in-memory stand-in
 * for the database: a first gift to a campaign joins that campaign's journey (and the general one, as before), a gift
 * to the campaign before its journey was switched on keeps the donor out of it, the win-back journey takes nobody on its
 * own, and a win-back donor who gives again leaves it. Email is off here, so nothing is sent.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
const C = "11111111-1111-4111-8111-111111111111";
const K = "44444444-4444-4444-8444-444444444444";
const GEN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CAMP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const reads: Record<string, number> = {};
function from(table: string) {
  reads[table] = (reads[table] ?? 0) + 1;
  const filters: ((r: Row) => boolean)[] = [];
  let op: { kind: "select" } | { kind: "update"; set: Row } | { kind: "upsert"; rows: Row[]; conflict: string[] } = { kind: "select" };
  let lim = Infinity;
  let rangeFrom = 0;
  const rows = () => (tables[table] ??= []);
  const matching = () => rows().filter((r) => filters.every((f) => f(r)));
  const result = () => {
    if (op.kind === "update") {
      const hit = matching();
      for (const r of hit) Object.assign(r, (op as { set: Row }).set);
      return { data: hit, error: null };
    }
    if (op.kind === "upsert") {
      const added: Row[] = [];
      for (const n of op.rows) {
        const conflict = (op as { conflict: string[] }).conflict;
        if (rows().some((r) => conflict.every((c) => r[c] === n[c]))) continue;
        const row = { id: `e${rows().length + 1}`, status: "active", ...n };
        rows().push(row);
        added.push(row);
      }
      return { data: added, error: null };
    }
    let out = matching().map((r) => (table === "charity_journeys" ? { ...r, charities: { status: "approved", name_en: "Meals", slug: "meals" } } : r));
    out = out.slice(rangeFrom, rangeFrom + Math.min(lim, 100000));
    return { data: out, error: null };
  };
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
    neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
    not: (c: string) => (filters.push((r) => r[c] != null), q),
    gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), q),
    gt: (c: string, v: string) => (filters.push((r) => String(r[c]) > v), q),
    lte: (c: string, v: string) => (filters.push((r) => String(r[c]) <= v), q),
    lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), q),
    order: () => q,
    limit: (n: number) => ((lim = n), q),
    range: (a: number, b: number) => ((rangeFrom = a), (lim = b - a + 1), q),
    update: (set: Row) => ((op = { kind: "update", set }), q),
    upsert: (rs: Row[], o: { onConflict: string }) => ((op = { kind: "upsert", rows: rs, conflict: o.onConflict.split(",") }), q),
    maybeSingle: async () => ({ data: result().data[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown) => Promise.resolve(result()).then(ok),
  };
  return q;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from }) }));
vi.mock("@/lib/email", () => ({ getEmailTransport: () => ({ name: "console", send: async () => "sent" }), EmailError: class extends Error {} }));

const { runJourneys } = await import("@/lib/charity/journey-store");
const { forgetJourneysV2 } = await import("@/lib/charity/journey-write");

const step = (journey_id: string) => ({ journey_id, charity_id: C, position: 1, subject: "Welcome", body: "Thank you for your gift.", wait_days: 2 });
const gift = (donor_id: string, paid_at: string, campaign_id: string | null = null, gateway = "paystack") => ({
  id: `g-${donor_id}-${paid_at}`,
  charity_id: C,
  donor_id,
  campaign_id,
  status: "paid",
  gateway,
  paid_at,
  donation_checkout_details: { email: `${donor_id}@example.org`, first_name: "Thandi", donor_type: "individual", contact_person: null, erased_at: null },
});

beforeEach(() => {
  forgetJourneysV2();
  for (const k of Object.keys(reads)) delete reads[k];
  tables = {
    charity_journeys: [
      { id: GEN, kind: "general", campaign_id: null, charity_id: C, enabled: true, switched_on_at: "2026-11-01T00:00:00Z" },
      { id: CAMP, kind: "campaign", campaign_id: K, charity_id: C, enabled: true, switched_on_at: "2026-11-01T00:00:00Z" },
      { id: WIN, kind: "winback", campaign_id: null, charity_id: C, enabled: true, switched_on_at: "2026-11-01T00:00:00Z" },
    ],
    charity_journey_steps: [step(GEN), step(CAMP), step(WIN)],
    charity_journey_enrolments: [],
    donations: [],
  };
});

describe("the daily run with campaign and win-back journeys", () => {
  it("a first gift to the campaign joins its journey; an earlier gift to the campaign keeps the donor out; win-back takes nobody on its own", async () => {
    tables.donations.push(
      gift("new", "2026-11-05T08:00:00Z", K), // first gift ever, to the campaign
      gift("old", "2026-10-20T08:00:00Z", K), // gave to the campaign before its journey was on
      gift("old", "2026-11-06T08:00:00Z", K),
      gift("plain", "2026-11-07T08:00:00Z"), // a first gift, not to the campaign
    );
    const run = await runJourneys(new Date("2026-11-10T06:00:00Z"), Date.now() + 10_000);
    expect(run.emailOff).toBe(true);
    const on = (j: string) => tables.charity_journey_enrolments.filter((e) => e.journey_id === j).map((e) => e.donor_id).sort();
    expect(on(CAMP)).toEqual(["new"]);
    expect(on(GEN)).toEqual(["new", "plain"]);
    expect(on(WIN)).toEqual([]);
    expect(tables.charity_journey_enrolments.every((e) => e.charity_id === C && e.source === "new_gift")).toBe(true);
    // Every switched-on journey's emails come in one read, not one per journey.
    expect(reads.charity_journey_steps).toBe(1);
  });

  it("finds a win-back donor who gave again however long the list is (it reads every page)", async () => {
    for (let i = 0; i < 1500; i++) {
      tables.charity_journey_enrolments.push({ id: `w${String(i).padStart(4, "0")}`, charity_id: C, journey_id: WIN, donor_id: `d${i}`, source: "winback", status: "active", enrolled_at: "2026-11-02T08:00:00Z", next_step: 1, next_due_at: "2026-11-30T08:00:00Z", attempts: 0 });
    }
    tables.donations.push(gift("d1499", "2026-11-08T08:00:00Z"));
    const run = await runJourneys(new Date("2026-11-10T06:00:00Z"), Date.now() + 10_000);
    expect(run.stopped).toBe(1);
    expect(tables.charity_journey_enrolments.find((e) => e.donor_id === "d1499")).toMatchObject({ status: "stopped", stopped_reason: "gave_again" });
  });

  it("a win-back donor who gives again leaves it; one who hasn't stays", async () => {
    tables.charity_journey_enrolments.push(
      { id: "w1", charity_id: C, journey_id: WIN, donor_id: "back", source: "winback", status: "active", enrolled_at: "2026-11-02T08:00:00Z", next_step: 1, next_due_at: "2026-11-30T08:00:00Z", attempts: 0 },
      { id: "w2", charity_id: C, journey_id: WIN, donor_id: "quiet", source: "winback", status: "active", enrolled_at: "2026-11-02T08:00:00Z", next_step: 1, next_due_at: "2026-11-30T08:00:00Z", attempts: 0 },
    );
    tables.donations.push(gift("back", "2026-11-08T08:00:00Z", null, "recorded"), gift("quiet", "2025-06-01T08:00:00Z"));
    const run = await runJourneys(new Date("2026-11-10T06:00:00Z"), Date.now() + 10_000);
    expect(run.stopped).toBe(1);
    expect(tables.charity_journey_enrolments.find((e) => e.id === "w1")).toMatchObject({ status: "stopped", stopped_reason: "gave_again" });
    expect(tables.charity_journey_enrolments.find((e) => e.id === "w2")).toMatchObject({ status: "active" });
  });
});
