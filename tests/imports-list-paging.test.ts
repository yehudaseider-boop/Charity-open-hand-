import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Two imports of 1 200 gifts each: more than the 1 000 rows the database returns at a time.
const imports = [
  { id: "i1", file_name: "october.csv", created_at: "2026-10-20T10:00:00Z" },
  { id: "i2", file_name: "september.csv", created_at: "2026-09-20T10:00:00Z" },
];
const gifts = [
  ...Array.from({ length: 1200 }, () => ({ import_id: "i1", amount_cents: 10000 })),
  ...Array.from({ length: 1200 }, () => ({ import_id: "i2", amount_cents: 5000 })),
];
function table(rows: Record<string, unknown>[]) {
  let out = rows;
  const q = {
    select: () => q,
    eq: () => q,
    in: (col: string, vs: unknown[]) => { out = out.filter((r) => vs.includes(r[col])); return q; },
    order: () => q,
    limit: async () => ({ data: out, error: null }),
    range: async (from: number, to: number) => ({ data: out.slice(from, Math.min(to, from + 999) + 1), error: null }),
  };
  return q;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (t: string) => table(t === "gift_imports" ? imports : gifts) }) }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/crypto", () => ({ encrypt: () => "", last4: () => "", receiptIdentity: () => "" }));

const { listImports } = await import("@/lib/charity/recorded-gifts-store");

describe("earlier imports", () => {
  it("counts and totals every gift of each import, past 1 000 rows", async () => {
    const list = await listImports("c1");
    expect(list.map((i) => [i.id, i.gifts, i.total_cents])).toEqual([["i1", 1200, 12_000_000], ["i2", 1200, 6_000_000]]);
  });
});
