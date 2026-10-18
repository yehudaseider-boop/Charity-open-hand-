/** Undo on the dashboard: never overwrites newer work, never removes a campaign someone gave to, never runs twice. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let removedFiles: string[];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ remove: async (paths: string[]) => (removedFiles.push(...paths), { error: null }) }) },
    from: (table: string) => {
      const f: [string, unknown, "eq" | "is" | "lt"][] = [];
      let op: "select" | "update" | "delete" | "insert" = "select";
      let patch: Row | null = null;
      let head = false;
      const match = (r: Row) => f.every(([c, v, k]) => (k === "is" ? (r[c] ?? null) === v : k === "lt" ? true : r[c] === v));
      const run = () => {
        const rows = tables[table] ?? (tables[table] = []);
        if (op === "insert") {
          const r = patch as Row;
          if (rows.some((x) => x.id === r.id)) return { data: null, error: { message: "duplicate key value" } };
          rows.push({ ...r });
          return { data: [r], error: null };
        }
        const hit = rows.filter(match);
        if (op === "update") hit.forEach((r) => Object.assign(r, patch));
        if (op === "delete") tables[table] = rows.filter((r) => !hit.includes(r));
        return { data: hit.map((r) => ({ ...r })), error: null, count: head ? hit.length : null };
      };
      const q: Record<string, unknown> = {
        select: (_c?: string, o?: { head?: boolean }) => ((head = Boolean(o?.head)), q),
        update: (p: Row) => ((op = "update"), (patch = p), q),
        delete: () => ((op = "delete"), q),
        insert: (p: Row) => ((op = "insert"), (patch = p), q),
        eq: (c: string, v: unknown) => (f.push([c, v, "eq"]), q),
        is: (c: string, v: unknown) => (f.push([c, v, "is"]), q),
        lt: (c: string, v: unknown) => (f.push([c, v, "lt"]), q),
        in: () => q,
        single: async () => { const r = run(); return { data: (r.data as Row[])?.[0] ?? null, error: r.error }; },
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
const now = new Date();
const action = (undo: unknown, kind = "profile_saved") => ({ id: A, charity_id: C, kind, details: {}, undo, undone_at: null, created_at: now.toISOString() });

beforeEach(() => {
  removedFiles = [];
  tables = { charities: [{ id: C, name_en: "New name", impact_en: "R50 feeds a family" }], charity_categories: [], donations: [], campaigns: [], charity_updates: [] };
});

describe("undo", () => {
  it("puts saved values back as they were", async () => {
    tables.charity_actions = [action({ type: "restore", table: "charities", before: { name_en: "Old name", impact_en: null }, after: { name_en: "New name", impact_en: "R50 feeds a family" } })];
    const r = await undoAction(C, A, "u1", "approved", now);
    expect(r.ok).toBe(true);
    expect(tables.charities[0]).toMatchObject({ name_en: "Old name", impact_en: null });
    expect(tables.charity_actions[0].undone_at).not.toBeNull();
  });

  it("refuses when the values were changed again since, and keeps the newer work", async () => {
    tables.charities[0].name_en = "Even newer name";
    tables.charity_actions = [action({ type: "restore", table: "charities", before: { name_en: "Old name" }, after: { name_en: "New name" } })];
    const r = await undoAction(C, A, "u1", "approved", now);
    expect(r).toMatchObject({ ok: false, why: "changed" });
    expect(tables.charities[0].name_en).toBe("Even newer name");
    expect(tables.charity_actions[0].undone_at).toBeNull(); // released, nothing changed
  });

  it("runs once: a second tap finds it already taken back", async () => {
    tables.charity_actions = [action({ type: "restore", table: "charities", before: { name_en: "Old name" }, after: { name_en: "New name" } })];
    expect((await undoAction(C, A, "u1", "approved", now)).ok).toBe(true);
    expect(await undoAction(C, A, "u1", "approved", now)).toMatchObject({ ok: false, why: "gone" });
  });

  it("never removes a campaign someone has given to", async () => {
    tables.campaigns = [{ id: "camp1", charity_id: C }];
    tables.donations = [{ id: "d1", campaign_id: "camp1" }];
    tables.charity_actions = [action({ type: "delete", table: "campaigns", id: "camp1" }, "campaign_started")];
    expect(await undoAction(C, A, "u1", "approved", now)).toMatchObject({ ok: false, why: "given" });
    expect(tables.campaigns).toHaveLength(1);
  });

  it("removes what an action added, with its file", async () => {
    tables.charity_updates = [{ id: "up1", charity_id: C }];
    tables.charity_actions = [action({ type: "delete", table: "charity_updates", id: "up1", file: { bucket: "charity-public", path: `${C}/updates/x.jpg` } }, "update_posted")];
    expect((await undoAction(C, A, "u1", "approved", now)).ok).toBe(true);
    expect(tables.charity_updates).toHaveLength(0);
    expect(removedFiles).toEqual([`${C}/updates/x.jpg`]);
  });

  it("puts back what an action removed, exactly as it was", async () => {
    const row = { id: "up1", charity_id: C, body_en: "Packed 120 parcels", photo_path: null, created_at: "2026-10-10T08:00:00Z" };
    tables.charity_actions = [action({ type: "reinsert", table: "charity_updates", row }, "update_removed")];
    expect((await undoAction(C, A, "u1", "approved", now)).ok).toBe(true);
    expect(tables.charity_updates).toEqual([row]);
  });

  it("never touches another charity's row, and never after 30 minutes", async () => {
    tables.charity_actions = [action({ type: "reinsert", table: "charity_updates", row: { id: "x", charity_id: "someone-else" } }, "update_removed")];
    expect(await undoAction(C, A, "u1", "approved", now)).toMatchObject({ ok: false, why: "gone" });
    tables.charity_actions = [{ ...action({ type: "restore", table: "charities", before: {}, after: {} }), created_at: new Date(now.getTime() - 31 * 60_000).toISOString() }];
    expect(await undoAction(C, A, "u1", "approved", now)).toMatchObject({ ok: false, why: "late" });
  });

  it("registration changes can't be taken back once the application is submitted", async () => {
    tables.charity_actions = [action({ type: "restore", table: "charities", before: { name_en: "Old" }, after: { name_en: "New name" } }, "organisation_saved")];
    expect(await undoAction(C, A, "u1", "pending_review", now)).toMatchObject({ ok: false, why: "locked" });
  });
});
