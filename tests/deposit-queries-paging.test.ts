import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// A big charity: 3 deposits, the first with 2 500 lines. The fake database hands back at most 1 000 rows a call,
// like the real one.
const payouts = [
  { id: "00000000-0000-0000-0000-000000000001", paid_out_on: "2026-10-23", status: "paid", amount_cents: 2500 * 100 },
  { id: "00000000-0000-0000-0000-000000000002", paid_out_on: "2026-10-22", status: "paid", amount_cents: 100 },
  { id: "00000000-0000-0000-0000-000000000003", paid_out_on: "2026-10-21", status: "pending", amount_cents: 100 },
];
const lines = [
  ...Array.from({ length: 2500 }, (_, i) => ({ payout_id: payouts[0].id, kind: "payment", donation_id: `d${i}`, gross_cents: 100, fee_cents: 0, net_cents: 100, line_no: i + 1 })),
  { payout_id: payouts[1].id, kind: "payment", donation_id: "x1", gross_cents: 100, fee_cents: 0, net_cents: 100, line_no: 1 },
  { payout_id: payouts[2].id, kind: "payment", donation_id: "x2", gross_cents: 100, fee_cents: 0, net_cents: 100, line_no: 1 },
];
let biggestPage = 0;

function table(rows: Record<string, unknown>[]) {
  let out = rows;
  const q = {
    select: () => q,
    eq: (col: string, v: unknown) => { if (col !== "charity_id") out = out.filter((r) => r[col] === v); return q; },
    in: (col: string, vs: unknown[]) => { out = out.filter((r) => vs.includes(r[col])); return q; },
    order: () => q,
    range: async (from: number, to: number) => { const page = out.slice(from, Math.min(to, from + 999) + 1); biggestPage = Math.max(biggestPage, page.length); return { data: page, error: null }; },
    maybeSingle: async () => ({ data: out[0] ?? null, error: null }),
  };
  return q;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (t: string) => table(t === "payouts" ? payouts : lines) }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ in: async (_c: string, ids: string[]) => ({ data: ids.map((id) => ({ id, amount_cents: 100, paid_at: "2026-10-20T10:00:00Z", donor_type: "individual", first_name: "Sample", last_name: "Donor", organisation_name: null, email: null })), error: null }) }) }) }) }),
}));

const { listDeposits, loadDeposit } = await import("@/lib/charity/deposit-queries");

describe("deposits for a big charity", () => {
  it("reads every line, past the database's 1 000-row page", async () => {
    const list = await listDeposits("c1");
    expect(list).toHaveLength(3);
    expect(list[0].deposit.rows.filter((r) => r.kind === "payment")).toHaveLength(2500);
    expect(list[0].deposit.balances).toBe(true);
    expect(biggestPage).toBeLessThanOrEqual(1000);
  });

  it("opens one deposit on its own, with all its lines", async () => {
    const d = await loadDeposit("c1", payouts[0].id);
    expect(d?.deposit.rows).toHaveLength(2500);
    expect(await loadDeposit("c1", "not-an-id")).toBeNull();
  });
});
