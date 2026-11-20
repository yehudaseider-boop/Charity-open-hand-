/**
 * A deposit only counts as final once its lines are saved (review 20/11/2026). Saved "paid" first, a failure
 * while writing the lines left a paid deposit with no lines that every later run skipped.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Op = { table: string; op: string; row?: Record<string, unknown> };
const ops: Op[] = [];
let failLines = false;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let op = "select";
      let row: Record<string, unknown> | undefined;
      const result = () => {
        if (table === "payout_lines" && op === "insert" && failLines) return { data: null, error: { message: "connection lost" } };
        if (table === "donations") return { data: [{ id: "d1", gateway_ref: "REF1" }], error: null };
        return { data: null, error: null };
      };
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        upsert: (r: Record<string, unknown>) => {
          op = "upsert";
          row = r;
          ops.push({ table, op, row });
          return q;
        },
        update: (r: Record<string, unknown>) => {
          op = "update";
          row = r;
          ops.push({ table, op, row });
          return q;
        },
        delete: () => {
          op = "delete";
          ops.push({ table, op });
          return q;
        },
        insert: (r: unknown) => {
          op = "insert";
          ops.push({ table, op, row: { rows: r } });
          return Promise.resolve(result());
        },
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: { id: "payout-1", charity_id: "c1" }, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve(result()),
      };
      return q;
    },
  }),
}));

const { keepPayout } = await import("@/lib/donations/payouts");

const payout = (status: "paid" | "pending" | "failed") => ({
  ref: "P1",
  paidOutOn: "2026-11-19",
  amountCents: 96_500,
  status,
  lines: [{ reference: "REF1", kind: "payment", grossCents: 100_000, feeCents: 3_500, netCents: 96_500 }],
});

beforeEach(() => {
  ops.length = 0;
  failLines = false;
});

describe("keeping a deposit", () => {
  it("saves a paid deposit as pending, writes its lines, then marks it paid last", async () => {
    const r = await keepPayout("c1", "test", payout("paid") as never);
    expect(r).toEqual({ lines: 1, unmatched: 0 });
    const payoutOps = ops.filter((o) => o.table === "payouts");
    expect(payoutOps[0]).toMatchObject({ op: "upsert", row: { status: "pending" } });
    expect(payoutOps.at(-1)).toMatchObject({ op: "update", row: { status: "paid" } });
    const linesAt = ops.findIndex((o) => o.table === "payout_lines" && o.op === "insert");
    const finalAt = ops.findIndex((o) => o.table === "payouts" && o.op === "update");
    expect(linesAt).toBeGreaterThan(-1);
    expect(finalAt).toBeGreaterThan(linesAt);
  });

  it("when the lines can't be saved, the deposit is never marked paid, so the next run reads it again", async () => {
    failLines = true;
    await expect(keepPayout("c1", "test", payout("paid") as never)).rejects.toMatchObject({ message: "connection lost" });
    const payoutOps = ops.filter((o) => o.table === "payouts");
    expect(payoutOps).toHaveLength(1);
    expect(payoutOps[0]).toMatchObject({ op: "upsert", row: { status: "pending" } });
  });

  it("a failed deposit also gets its status only after its lines", async () => {
    await keepPayout("c1", "test", payout("failed") as never);
    expect(ops.filter((o) => o.table === "payouts").map((o) => [o.op, o.row?.status])).toEqual([["upsert", "pending"], ["update", "failed"]]);
  });

  it("a pending deposit is saved as pending, with no second write", async () => {
    await keepPayout("c1", "test", payout("pending") as never);
    expect(ops.filter((o) => o.table === "payouts").map((o) => [o.op, o.row?.status])).toEqual([["upsert", "pending"]]);
  });
});
