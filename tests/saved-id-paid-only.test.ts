/**
 * "Use my ID ending 1234" comes only from a gift that was paid (review of 11/11/2026). Anyone can start a gift with
 * someone else's email and an ID number of their choosing; an unpaid one must never be offered to the email's owner.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/crypto", () => ({ decrypt: (s: string) => `plain:${s}` }));

type Rec = { table: string; eq: [string, unknown][] };
const calls: Rec[] = [];
const rows: Record<string, unknown[]> = {};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const rec: Rec = { table, eq: [] };
      calls.push(rec);
      const done = () => Promise.resolve({ data: rows[table] ?? [] });
      const b: Record<string, unknown> = {
        select: () => b,
        in: () => b,
        is: () => b,
        not: () => b,
        order: () => b,
        eq: (k: string, v: unknown) => (rec.eq.push([k, v]), b),
        limit: () => done(),
        then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => done().then(ok, bad),
      };
      return b;
    },
  }),
}));

const { savedIdLast4, savedIdNumber } = await import("@/lib/donations/saved-id");

describe("the saved ID number", () => {
  beforeEach(() => {
    calls.length = 0;
    rows.donors = [{ id: "donor-1" }];
    rows.donations = [{ id: "gift-1" }];
    rows.donation_checkout_details = [{ donation_id: "gift-1", id_number_encrypted: "enc", id_number_last4: "1234", address_line1: null, city: null, postal_code: null }];
  });

  it("looks only at paid gifts", async () => {
    expect(await savedIdLast4("user-1")).toBe("1234");
    const gifts = calls.find((c) => c.table === "donations");
    expect(gifts?.eq).toContainEqual(["status", "paid"]);
    expect(gifts?.eq).toContainEqual(["wants_18a", true]);
  });

  it("looks only at gifts this same account started while signed in (never a guest gift with their email)", async () => {
    await savedIdLast4("user-1");
    const details = calls.find((c) => c.table === "donation_checkout_details");
    expect(details?.eq).toContainEqual(["started_by_user", "user-1"]);
  });

  it("offers nothing when there is no paid gift with an ID", async () => {
    rows.donations = [];
    expect(await savedIdLast4("user-1")).toBeNull();
    expect(await savedIdNumber("user-1")).toBeNull();
  });
});
