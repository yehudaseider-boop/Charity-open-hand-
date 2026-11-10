/** Undo for the donor journey (CRM step 6a): the switch and the emails come back as they were, never over a newer change; added donors come off until they have had an email; only the owner. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
let role = "owner";
vi.mock("@/lib/charity/team", () => ({ memberRole: async () => role }));

type State = { enabled: boolean; switched_on_at: string | null; steps: { subject: string; body: string; waitDays: number }[] };
let journeyNow: State;
let removable = 0;
const removed: string[][] = [];
vi.mock("@/lib/charity/journey-write", () => ({
  readJourneyState: async () => structuredClone(journeyNow),
  writeJourney: async (_c: string, _u: string | null, s: State) => {
    journeyNow = structuredClone(s);
  },
  removeEnrolments: async (_c: string, ids: string[]) => {
    removed.push(ids);
    return { removed: removable, stayed: ids.length - removable };
  },
}));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const f: [string, unknown][] = [];
      let op: "select" | "update" | "delete" | "upsert" = "select";
      let patch: Row | null = null;
      const run = () => {
        const rows = tables[table] ?? (tables[table] = []);
        if (op === "upsert") {
          const r = patch as Row;
          tables[table] = [...rows.filter((x) => x.charity_id !== r.charity_id), { ...r }];
          return { data: [r], error: null };
        }
        const hit = rows.filter((r) => f.every(([c, v]) => (r[c] ?? null) === v));
        if (op === "update") hit.forEach((r) => Object.assign(r, patch));
        if (op === "delete") tables[table] = rows.filter((r) => !hit.includes(r));
        return { data: hit.map((r) => ({ ...r })), error: null };
      };
      const q: Record<string, unknown> = {
        select: () => q,
        update: (p: Row) => ((op = "update"), (patch = p), q),
        delete: () => ((op = "delete"), q),
        upsert: (p: Row) => ((op = "upsert"), (patch = p), q),
        eq: (c: string, v: unknown) => (f.push([c, v]), q),
        is: (c: string, v: unknown) => (f.push([c, v]), q),
        maybeSingle: async () => { const r = run(); return { data: (r.data as Row[])?.[0] ?? null, error: r.error }; },
        then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
      };
      return q;
    },
  }),
}));

const { undoAction } = await import("@/lib/charity/charity-actions");
const C = "c0000000-0000-0000-0000-000000000001";
const A = "a0000000-0000-0000-0000-00000000000a";
const action = (kind: string, undo: unknown) => ({ id: A, charity_id: C, kind, details: {}, undo, undone_at: null, created_at: new Date().toISOString() });
const one = { subject: "Welcome", body: "Thank you for your gift.", waitDays: 2 };
const off: State = { enabled: false, switched_on_at: null, steps: [one] };
const on: State = { enabled: true, switched_on_at: "2026-11-10T08:00:00+00:00", steps: [one] };

beforeEach(() => {
  tables = { charity_actions: [] };
  role = "owner";
  removable = 0;
  removed.length = 0;
});

describe("taking back a change to the donor journey", () => {
  it("taking back 'switch off' switches it on from now, so people who first gave while it was off don't join as new", async () => {
    journeyNow = structuredClone(off);
    journeyNow.switched_on_at = on.switched_on_at;
    tables.charity_actions = [action("journey_off", { type: "journey", before: on, after: { ...off, switched_on_at: on.switched_on_at } })];
    const before = Date.now();
    expect(await undoAction(C, A, "u1", "approved")).toMatchObject({ ok: true });
    expect(journeyNow.enabled).toBe(true);
    expect(new Date(journeyNow.switched_on_at!).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("switching on is taken back: it is off again", async () => {
    journeyNow = structuredClone(on);
    tables.charity_actions = [action("journey_on", { type: "journey", before: off, after: on })];
    expect(await undoAction(C, A, "u1", "approved")).toMatchObject({ ok: true });
    expect(journeyNow).toEqual(off);
  });

  it("saved emails come back as they were", async () => {
    const edited = { ...on, steps: [{ ...one, subject: "Hello there" }, { ...one, waitDays: 30 }] };
    journeyNow = structuredClone(edited);
    tables.charity_actions = [action("journey_saved", { type: "journey", before: on, after: edited })];
    expect(await undoAction(C, A, "u1", "approved")).toMatchObject({ ok: true });
    expect(journeyNow).toEqual(on);
  });

  it("a journey changed again since is left alone, and Undo can be tried again", async () => {
    journeyNow = { ...on, steps: [{ ...one, subject: "Changed by a colleague" }] };
    tables.charity_actions = [action("journey_on", { type: "journey", before: off, after: on })];
    expect(await undoAction(C, A, "u1", "approved")).toMatchObject({ ok: false, why: "changed" });
    expect(journeyNow.steps[0].subject).toBe("Changed by a colleague");
    expect(tables.charity_actions[0].undone_at).toBeNull();
  });

  it("only the owner can take it back", async () => {
    role = "admin";
    journeyNow = structuredClone(on);
    tables.charity_actions = [action("journey_on", { type: "journey", before: off, after: on })];
    expect(await undoAction(C, A, "u1", "approved")).toMatchObject({ ok: false, why: "owner" });
    expect(journeyNow).toEqual(on);
  });

  it("added donors come off; once they have all had an email, they stay", async () => {
    tables.charity_actions = [action("journey_existing_added", { type: "journey_enrolments", ids: ["e1", "e2"] })];
    removable = 1;
    expect(await undoAction(C, A, "u1", "approved")).toMatchObject({ ok: true, row: { details: { removed: 1, stayed: 1 } } });
    expect(removed).toEqual([["e1", "e2"]]);
    // The record says so, for "what just happened".
    expect(tables.charity_actions[0].details).toMatchObject({ removed: 1, stayed: 1 });
    tables.charity_actions = [action("journey_existing_added", { type: "journey_enrolments", ids: ["e3"] })];
    removable = 0;
    expect(await undoAction(C, A, "u1", "approved")).toMatchObject({ ok: false, why: "emailed" });
  });
});
