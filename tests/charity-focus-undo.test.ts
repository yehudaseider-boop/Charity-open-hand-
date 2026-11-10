/** Undo for the charity's focus: puts back what was there before, and never overwrites a newer change. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/charity/team", () => ({ memberRole: async () => "admin" }));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let missingCampaign = false;

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
          if (table === "charity_focus" && missingCampaign && r.campaign_id) return { data: null, error: { message: 'violates foreign key constraint "charity_focus_campaign"' } };
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
const older = { campaign_id: "k1", title: "Roof repairs", message: "The hall roof leaks.", starts_on: "2026-11-01", ends_on: "2026-11-20" };
const newer = { campaign_id: null, title: "Winter blankets", message: "Nights are cold.", starts_on: "2026-11-10", ends_on: "2026-11-30" };
const stored = (r: Row) => ({ charity_id: C, ...r, updated_at: "2026-11-10T08:00:00Z", updated_by: "u1" });
const action = (kind: string, undo: unknown) => ({ id: A, charity_id: C, kind, details: {}, undo, undone_at: null, created_at: new Date().toISOString() });
const focusNow = () => tables.charity_focus.map(({ campaign_id, title, starts_on, ends_on }) => ({ campaign_id, title, starts_on, ends_on }));

beforeEach(() => {
  tables = { charity_actions: [], charity_focus: [] };
  missingCampaign = false;
});

describe("taking back a change to the charity's focus", () => {
  it("a first focus is removed again", async () => {
    tables.charity_focus = [stored(newer)];
    tables.charity_actions = [action("focus_saved", { type: "focus", before: null, after: newer })];
    expect(await undoAction(C, A, "u1", "approved")).toMatchObject({ ok: true });
    expect(tables.charity_focus).toEqual([]);
  });

  it("a replaced focus comes back as it was, dates included", async () => {
    tables.charity_focus = [stored(newer)];
    tables.charity_actions = [action("focus_saved", { type: "focus", before: older, after: newer })];
    expect(await undoAction(C, A, "u1", "approved")).toMatchObject({ ok: true });
    expect(focusNow()).toEqual([{ campaign_id: "k1", title: "Roof repairs", starts_on: "2026-11-01", ends_on: "2026-11-20" }]);
  });

  it("a removed focus comes back, without its campaign if that was removed since", async () => {
    tables.charity_actions = [action("focus_removed", { type: "focus", before: older, after: null })];
    missingCampaign = true;
    expect(await undoAction(C, A, "u1", "approved")).toMatchObject({ ok: true });
    expect(focusNow()).toEqual([{ campaign_id: null, title: "Roof repairs", starts_on: "2026-11-01", ends_on: "2026-11-20" }]);
  });

  it("a focus changed again since is left alone, and Undo can be tried again later", async () => {
    tables.charity_focus = [stored({ ...newer, title: "Edited by a colleague" })];
    tables.charity_actions = [action("focus_saved", { type: "focus", before: older, after: newer })];
    expect(await undoAction(C, A, "u1", "approved")).toMatchObject({ ok: false, why: "changed" });
    expect(focusNow()[0].title).toBe("Edited by a colleague");
    expect(tables.charity_actions[0].undone_at).toBeNull();
    // Removed and then set again by someone else: the removal can't be taken back over it.
    tables.charity_actions = [action("focus_removed", { type: "focus", before: older, after: null })];
    expect(await undoAction(C, A, "u1", "approved")).toMatchObject({ ok: false, why: "changed" });
  });

  it("only runs once", async () => {
    tables.charity_focus = [stored(newer)];
    tables.charity_actions = [action("focus_saved", { type: "focus", before: null, after: newer })];
    expect(await undoAction(C, A, "u1", "approved")).toMatchObject({ ok: true });
    expect(await undoAction(C, A, "u1", "approved")).toMatchObject({ ok: false, why: "gone" });
  });
});
