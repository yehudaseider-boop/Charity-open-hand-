/** Owner and admin: who may remove whom. The database is faked: a charity's team as rows. */
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

type Row = { charity_id: string; user_id: string; role: "owner" | "admin"; created_at: string };
let rows: Row[] = [];
const deleted: string[] = [];
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/auth", () => ({ getViewer: async () => null }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const filters: Record<string, string> = {};
      let del = false;
      const q: Record<string, unknown> = {
        select: () => q,
        order: () => q,
        delete: () => ((del = true), q),
        in: () => q,
        eq: (c: string, v: string) => ((filters[c] = v), q),
        maybeSingle: async () => ({ data: table === "profiles" ? null : rows.find((r) => r.user_id === filters.user_id) ?? null, error: null }),
        then: (ok: (v: unknown) => unknown) => {
          if (table === "profiles") return Promise.resolve({ data: rows.map((r) => ({ id: r.user_id, email: `${r.user_id}@x.test` })), error: null }).then(ok);
          const hit = rows.filter((r) => Object.entries(filters).every(([k, v]) => (r as Record<string, string>)[k] === v));
          if (del) {
            rows = rows.filter((r) => !hit.includes(r));
            deleted.push(...hit.map((r) => r.user_id));
          }
          return Promise.resolve({ data: hit, error: null }).then(ok);
        },
      };
      return q;
    },
  }),
}));
const { removeMember } = await import("@/lib/charity/team");

const row = (user_id: string, role: Row["role"]): Row => ({ charity_id: "c1", user_id, role, created_at: "2026-10-01T00:00:00Z" });
beforeEach(() => {
  rows = [row("owner1", "owner"), row("admin1", "admin")];
  deleted.length = 0;
});

describe("removing someone from a charity's team", () => {
  it("an owner can remove an admin", async () => {
    expect(await removeMember("c1", "owner1", "admin1")).toEqual({ ok: true, email: "admin1@x.test" });
    expect(deleted).toEqual(["admin1"]);
  });
  it("the only owner can't remove themselves, and nobody removes another owner here", async () => {
    expect((await removeMember("c1", "owner1", "owner1")).ok).toBe(false);
    rows.push(row("owner2", "owner"));
    expect((await removeMember("c1", "owner2", "owner1")).ok).toBe(false);
    expect(deleted).toEqual([]);
    // With a second owner, an owner may step down.
    expect((await removeMember("c1", "owner1", "owner1")).ok).toBe(true);
  });
  it("someone already gone is said plainly", async () => {
    expect(await removeMember("c1", "owner1", "nobody")).toEqual({ ok: false, message: "That person no longer has access." });
  });
});
