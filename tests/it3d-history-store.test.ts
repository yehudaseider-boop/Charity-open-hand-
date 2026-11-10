/**
 * The IT3(d) history store: every read and change names the charity (so another charity's entry is never
 * reached), a mark only lands on an unmarked entry, and the audit log gets what was marked but never the
 * charity's own reference.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Call = { table: string; op: string; values?: unknown; filters: [string, string, unknown][] };
const calls: Call[] = [];
let answer: Record<string, unknown[]> = {};
const audits: { action: string; details: Record<string, unknown> }[] = [];

function from(table: string) {
  const call: Call = { table, op: "select", filters: [] };
  calls.push(call);
  const q: Record<string, unknown> = {};
  const chain = () => q;
  Object.assign(q, {
    select: chain,
    insert: (v: unknown) => ((call.op = "insert"), (call.values = v), q),
    update: (v: unknown) => ((call.op = "update"), (call.values = v), q),
    eq: (c: string, v: unknown) => (call.filters.push([c, "eq", v]), q),
    is: (c: string, v: unknown) => (call.filters.push([c, "is", v]), q),
    not: (c: string, o: string, v: unknown) => (call.filters.push([c, `not ${o}`, v]), q),
    in: (c: string, v: unknown) => (call.filters.push([c, "in", v]), q),
    order: chain,
    limit: chain,
    maybeSingle: async () => ({ data: (answer[table] ?? [])[0] ?? null, error: null }),
    then: (ok: (v: { data: unknown[]; error: null }) => unknown) => ok({ data: answer[table] ?? [], error: null }),
  });
  return q;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from }) }));
vi.mock("@/lib/audit", () => ({ logAudit: async (a: { action: string; details: Record<string, unknown> }) => void audits.push(a) }));

const { clearIt3dUploaded, loadIt3dHistory, loadIt3dHistoryEntry, markIt3dUploaded, recordIt3dDownload } = await import("@/lib/receipts/it3d-history-store");

const raw = (over: Record<string, unknown> = {}) => ({
  id: "h1", tax_year: 2027, period: "full_year", kind: "file", test_data: false, receipts: 3, donors: 2, donations: 4, total_cents: "125000",
  receipts_left_out: 1, created_by: "u1", created_at: "2026-11-10T08:00:00Z", uploaded_on: null, upload_reference: null, marked_at: null, ...over,
});

beforeEach(() => {
  calls.length = 0;
  audits.length = 0;
  answer = {};
});

describe("the IT3(d) history store", () => {
  it("lists one charity's entries with who downloaded each, and says when there are more than it shows", async () => {
    answer = { charity_it3d_history: [raw(), raw({ id: "h2", created_by: "gone" }), raw({ id: "h3", created_by: null })], profiles: [{ id: "u1", full_name: " Sarah Example ", email: "sarah@x.co" }] };
    const { rows, more } = await loadIt3dHistory("c1", 2);
    expect(more).toBe(true);
    expect(rows.map((r) => [r.id, r.who, r.totalCents, r.receiptsLeftOut])).toEqual([["h1", "Sarah Example", 125000, 1], ["h2", null, 125000, 1]]);
    expect(calls[0]).toMatchObject({ table: "charity_it3d_history", filters: [["charity_id", "eq", "c1"]] });
    expect(calls[1]).toMatchObject({ table: "profiles", filters: [["id", "in", ["u1", "gone"]]] });
  });

  it("an empty history is an empty list, and no names are looked up", async () => {
    expect(await loadIt3dHistory("c1")).toEqual({ rows: [], more: false });
    expect(calls).toHaveLength(1);
  });

  it("one entry is read by its id and its charity together", async () => {
    answer = { charity_it3d_history: [raw()] };
    expect(await loadIt3dHistoryEntry("c1", "h1")).toMatchObject({ id: "h1", uploadedOn: null });
    expect(calls[0].filters).toEqual([["charity_id", "eq", "c1"], ["id", "eq", "h1"]]);
  });

  it("a mark lands only on this charity's unmarked entry, and the audit log never holds the reference", async () => {
    answer = { charity_it3d_history: [{ id: "h1", tax_year: 2027, period: "full_year", kind: "file" }] };
    const now = new Date("2026-11-12T07:00:00Z");
    expect(await markIt3dUploaded({ charityId: "c1", id: "h1", userId: "u1", uploadedOn: "2026-11-11", reference: "eFiling 123", now })).toBe(true);
    expect(calls[0]).toEqual({
      table: "charity_it3d_history", op: "update",
      values: { uploaded_on: "2026-11-11", upload_reference: "eFiling 123", marked_by: "u1", marked_at: "2026-11-12T07:00:00.000Z" },
      filters: [["charity_id", "eq", "c1"], ["id", "eq", "h1"], ["uploaded_on", "is", null]],
    });
    expect(audits).toEqual([{ actorUserId: "u1", action: "charity.it3d_marked_uploaded", entityType: "charity", entityId: "c1", details: { historyId: "h1", taxYear: 2027, period: "full_year", kind: "file" } }]);
    expect(JSON.stringify(audits)).not.toContain("eFiling 123");
  });

  it("nothing matched (another charity's entry, or marked a moment ago): false, and nothing in the audit log", async () => {
    expect(await markIt3dUploaded({ charityId: "c1", id: "h9", userId: "u1", uploadedOn: "2026-11-11", reference: null })).toBe(false);
    expect(await clearIt3dUploaded({ charityId: "c1", id: "h9", userId: "u1" })).toBe(false);
    expect(audits).toEqual([]);
  });

  it("Undo clears the whole mark on this charity's marked entry", async () => {
    answer = { charity_it3d_history: [{ id: "h1", tax_year: 2027, period: "first_half", kind: "sheet" }] };
    expect(await clearIt3dUploaded({ charityId: "c1", id: "h1", userId: "u1" })).toBe(true);
    expect(calls[0]).toEqual({
      table: "charity_it3d_history", op: "update",
      values: { uploaded_on: null, upload_reference: null, marked_by: null, marked_at: null },
      filters: [["charity_id", "eq", "c1"], ["id", "eq", "h1"], ["uploaded_on", "not is", null]],
    });
    expect(audits[0]).toMatchObject({ action: "charity.it3d_mark_removed", details: { historyId: "h1", kind: "sheet" } });
  });

  it("a download is one insert of the entry as given", async () => {
    const entry = { charity_id: "c1", tax_year: 2027, period: "full_year" as const, kind: "file" as const, test_data: false, receipts: 3, donors: 2, donations: 4, total_cents: 125000, receipts_left_out: 0, created_by: "u1" };
    await recordIt3dDownload(entry);
    expect(calls).toEqual([{ table: "charity_it3d_history", op: "insert", values: entry, filters: [] }]);
  });
});
