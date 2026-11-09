/**
 * Adding an SA ID number to a monthly donation (account page), with the database faked: a gift on an issued
 * s18A receipt is never changed, and that includes the first gift, which new monthly gifts copy from. Then the ID
 * number is kept on the monthly donation itself, so every new gift still carries it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const REC = "11111111-1111-4111-8111-111111111111";
const FIRST = "22222222-2222-4222-8222-222222222222";
const LATER = "33333333-3333-4333-8333-333333333333";

let issued: Set<string>;
let written: string[][];
let carried: Record<string, unknown>[];
const audits: { action: string; details?: Record<string, unknown> }[] = [];

vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "u1" }) }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => false }));
vi.mock("@/lib/audit", () => ({ logAudit: async (a: { action: string; details?: Record<string, unknown> }) => void audits.push(a) }));
vi.mock("@/lib/donations/s18a-complete", () => ({
  contactUs: () => "reply to any email we've sent you",
  onIssuedReceipt: async (_db: unknown, ids: string[]) => new Set(ids.filter((id) => issued.has(id))),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let ids: string[] = [];
      let updating = false;
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is"]) q[m] = () => q;
      q.update = (v: Record<string, unknown>) => ((updating = true), table === "recurring_donations" && carried.push(v), q);
      q.in = (_c: string, v: string[]) => ((ids = v), q);
      q.maybeSingle = async () => {
        if (table === "recurring_donations") return { data: { id: REC, donor_id: "donor-1", status: "active", wants_18a: true, first_donation_id: FIRST }, error: null };
        return {
          data: { donation_id: FIRST, donor_type: "individual", id_number_encrypted: null, tax_reference_encrypted: "enc", address_line1: "1 Long Street", erased_at: null },
          error: null,
        };
      };
      q.then = (ok: (v: unknown) => unknown) => {
        if (table === "donors") return Promise.resolve({ data: [{ id: "donor-1" }], error: null }).then(ok);
        if (table === "donations") {
          const gift = (id: string) => ({ id, recurring_id: REC, donor_id: "donor-1", status: "paid", tax_year: 2027 });
          return Promise.resolve({ data: [gift(FIRST), gift(LATER)], error: null }).then(ok);
        }
        if (table === "recurring_donations" && updating) return Promise.resolve({ data: [{ id: REC }], error: null }).then(ok);
        if (table === "donation_checkout_details" && updating) {
          written.push(ids);
          return Promise.resolve({ data: ids.map((donation_id) => ({ donation_id })), error: null }).then(ok);
        }
        return Promise.resolve({ data: null, error: null }).then(ok);
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/dates", async (orig) => ({ ...(await orig<typeof import("@/lib/dates")>()), taxYearFor: () => 2027 }));

const { addMonthlyId } = await import("@/app/account/monthly/add-id-action");

const form = () => {
  const f = new FormData();
  f.set("id", REC);
  f.set("id_number", "8001015009087");
  return f;
};

beforeEach(() => {
  issued = new Set();
  written = [];
  carried = [];
  audits.length = 0;
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("adding an ID number to a monthly donation", () => {
  it("writes the first gift (what new gifts copy) and this year's gifts", async () => {
    const res = await addMonthlyId({ ok: false, message: "" } as never, form());
    expect(res.ok).toBe(true);
    expect(written).toHaveLength(1);
    expect(new Set(written[0])).toEqual(new Set([FIRST, LATER]));
  });

  it("never changes a first gift that is on an issued s18A receipt: keeps the ID on the monthly donation for new gifts", async () => {
    issued = new Set([FIRST]);
    const res = await addMonthlyId({ ok: false, message: "" } as never, form());
    expect(res.ok).toBe(true);
    expect(written).toEqual([[LATER]]);
    expect(carried).toHaveLength(1);
    expect(carried[0]).toMatchObject({ id_number_carry_last4: "9087" });
    expect(String(carried[0].id_number_carry_encrypted)).not.toContain("8001015009087");
    expect(res.message).not.toMatch(/!/);
    expect(audits.at(-1)?.details).toMatchObject({ carried_on_monthly: true, gifts_updated: 1 });
  });

  it("still works when every gift so far is on an issued s18A receipt: new gifts carry the ID", async () => {
    issued = new Set([FIRST, LATER]);
    const res = await addMonthlyId({ ok: false, message: "" } as never, form());
    expect(res.ok).toBe(true);
    expect(written).toEqual([]);
    expect(carried).toHaveLength(1);
  });
});
