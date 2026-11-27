/**
 * Partial refunds and open disputes on s18A receipts (20/11/2026). A R1 000 gift refunded R400 is receipted for
 * R600; a gift held for a person (an open dispute, a refund being reviewed) or refunded in full is left off, as
 * issue_s18a_receipt does. A platform admin records the part refunded in Rand, never more than what is left.
 * No database: the store and the admin client are stand-ins.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { planReceipts, receiptableCents, type PlanCharity, type PlanDonation } from "@/lib/receipts/plan";
import { supabaseReceiptStore } from "@/lib/receipts/store";

vi.mock("server-only", () => ({}));

const charity: PlanCharity = { id: "c1", isS18a: true, mandateSignedAt: "2026-03-09T00:00:00+02:00", s18aPeriods: [{ startedAt: "2026-03-09T00:00:00+02:00", endedAt: null }] };
const don = (o: Partial<PlanDonation>): PlanDonation => ({
  id: "d1", charityId: "c1", donorId: "u1", donorIdentity: "", taxYear: 2027, amountCents: 100_000, status: "paid", wants18a: true,
  paidAt: "2026-10-01T10:00:00Z", ...o,
});
const plan = (donations: PlanDonation[]) => planReceipts({ taxYear: 2027, donations, charities: [charity], alreadyReceipted: new Set() });

describe("planning s18A receipts with partial refunds and holds", () => {
  it("counts what is left of a partly refunded gift: R1 000 refunded R400 is receipted for R600", () => {
    const { receipts } = plan([don({ id: "a", amountCents: 100_000, refundedCents: 40_000 }), don({ id: "b", amountCents: 18_000 })]);
    expect(receipts).toEqual([expect.objectContaining({ donationIds: ["a", "b"], totalCents: 78_000 })]);
  });

  it("leaves out a held gift and one refunded in full, and says why", () => {
    const { receipts, skipped } = plan([
      don({ id: "held", receiptHold: "dispute open" }),
      don({ id: "gone", amountCents: 5_000, refundedCents: 5_000 }),
      don({ id: "ok", amountCents: 20_000 }),
    ]);
    expect(receipts).toEqual([expect.objectContaining({ donationIds: ["ok"], totalCents: 20_000 })]);
    expect(skipped).toEqual([
      { donationId: "held", reason: "on_hold" },
      { donationId: "gone", reason: "fully_refunded" },
    ]);
  });

  it("a gift with no refund or hold recorded counts in full, as before", () => {
    expect(plan([don({ amountCents: 30_000 })]).receipts[0].totalCents).toBe(30_000);
    expect(receiptableCents({ amountCents: 30_000 })).toBe(30_000);
    expect(receiptableCents({ amountCents: 30_000, refundedCents: 40_000 })).toBe(0);
  });
});

describe("the receipt store reads refunds and holds", () => {
  function fakeDb(rows: Record<string, unknown>[]) {
    const selects: string[] = [];
    const from = () => {
      const q: Record<string, unknown> = {};
      for (const m of ["is", "eq", "order", "range", "in"]) q[m] = () => q;
      q.select = (cols: string) => (selects.push(cols), q);
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok);
      return q;
    };
    return { db: { from } as unknown as SupabaseClient, selects };
  }
  const details = { receipt_identity: "", donor_type: "individual", id_number_encrypted: "x", tax_reference_encrypted: null, registration_number: null, address_line1: "1 Road", first_name: "Thandi", last_name: "M" };

  it("listDonations passes the part refunded and any hold to planning", async () => {
    const { db, selects } = fakeDb([
      { id: "a", charity_id: "c1", donor_id: "u1", tax_year: 2027, amount_cents: "100000", refunded_cents: "40000", receipt_hold: null, status: "paid", wants_18a: true, paid_at: "2026-10-01T10:00:00Z", donation_checkout_details: details },
      { id: "b", charity_id: "c1", donor_id: "u1", tax_year: 2027, amount_cents: 5000, refunded_cents: 0, receipt_hold: "dispute open", status: "paid", wants_18a: true, paid_at: "2026-10-02T10:00:00Z", donation_checkout_details: details },
    ]);
    const list = await supabaseReceiptStore(db).listDonations(2027);
    expect(selects[0]).toContain("refunded_cents");
    expect(selects[0]).toContain("receipt_hold");
    expect(list.map((d) => [d.id, d.amountCents, d.refundedCents, d.receiptHold])).toEqual([["a", 100_000, 40_000, null], ["b", 5_000, 0, "dispute open"]]);
    expect(plan(list).receipts[0]).toMatchObject({ donationIds: ["a"], totalCents: 60_000 });
  });

  it("donorDetailsFor gives each receipt line what is left of the gift, so the lines add up to the total", async () => {
    const { db } = fakeDb([{ id: "a", paid_at: "2026-10-01T10:00:00Z", amount_cents: 100_000, refunded_cents: 40_000, recorded_method: null, payment_channel: null, donation_checkout_details: details }]);
    const [row] = await supabaseReceiptStore(db).donorDetailsFor(["a"]);
    expect(row.amountCents).toBe(60_000);
  });
});

// ---- The admin action ---------------------------------------------------------------------------------------

const recorded: unknown[][] = [];
let donationRow: { status: string; amount_cents: number; refunded_cents: number } | null;
let outcome = "done";
let admin = true;
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth", () => ({
  requirePlatformAdmin: async () => {
    if (!admin) throw new Error("not allowed");
    return { userId: "admin-1" };
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) q[m] = () => q;
      q.maybeSingle = async () => ({ data: donationRow, error: null });
      return q;
    },
  }),
}));
vi.mock("@/lib/donations/reverse", () => ({
  // As the database answers (migration 20261127000001): "refuse" with a refund of that amount already there.
  recordPartialRefund: async (...args: unknown[]) => (recorded.push(args), args[5] === "refuse" && sameAmount.provider + sameAmount.person > 0 ? "same_amount" : outcome),
  clearReceiptHold: async (...args: unknown[]) => (recorded.push(["clear", ...args]), true),
  releaseDisputeHold: async () => true,
  reverseDonation: async () => "done",
  sameAmountRefunds: async () => sameAmount,
}));

const { clearHold, recordPartRefund } = await import("@/app/admin/payments/actions");
const DONATION = "3f9a2c71-0b1d-4e5f-9a8b-123456789abc";
const ENTRY = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
let sameAmount = { provider: 0, person: 0 };
const send = (amount: string, donation = DONATION, entry = ENTRY, separate = false) => {
  const f = new FormData();
  f.set("amount", amount);
  if (separate) f.set("separate", "on");
  return recordPartRefund(donation, entry, { ok: false }, f);
};

describe("an admin records part of a gift refunded", () => {
  beforeEach(() => {
    recorded.length = 0;
    donationRow = { status: "paid", amount_cents: 100_000, refunded_cents: 0 };
    outcome = "done";
    admin = true;
    sameAmount = { provider: 0, person: 0 };
  });

  it("records the amount in cents, once per entry, and says what is left for the receipt", async () => {
    const r = await send("R400");
    expect(recorded).toEqual([[DONATION, 40_000, `admin:${ENTRY}`, "admin-1", "recorded by a platform admin", "refuse"]]);
    expect(r).toEqual({ ok: true, message: "Recorded. R600 of the gift is left for the s18A receipt." });
    expect(await send("400.50")).toMatchObject({ ok: true });
    expect(recorded[1][1]).toBe(40_050);
  });

  it("refuses empty, silly, zero, comma-thousands and too-big amounts, recording nothing", async () => {
    for (const typed of ["", "abc", "0", "1,000", "-5", "99999999999999999999"]) {
      const r = await send(typed);
      expect(r.ok).toBe(false);
      expect(r.fieldErrors?.amount).toBeTruthy();
    }
    expect(recorded).toEqual([]);
  });

  it("never more than what is left of the gift", async () => {
    donationRow = { status: "paid", amount_cents: 100_000, refunded_cents: 70_000 };
    const r = await send("400");
    expect(r.fieldErrors?.amount).toBe("That is more than what is left of the gift (R300)");
    expect(recorded).toEqual([]);
  });

  it("only on a paid gift, and only for a real donation and entry", async () => {
    donationRow = { status: "charged_back", amount_cents: 100_000, refunded_cents: 0 };
    expect(await send("400")).toEqual({ ok: false, message: "This donation is now charged back, so nothing was recorded." });
    expect((await send("400", "nope")).ok).toBe(false);
    expect((await send("400", DONATION, "nope")).ok).toBe(false);
    expect(recorded).toEqual([]);
  });

  it("a second press of the same form says it was already recorded", async () => {
    outcome = "already";
    expect(await send("400")).toEqual({ ok: true, message: "This was already recorded. Nothing more was changed." });
  });

  it("a refund of the same amount already recorded on the gift is not counted again without the tick (fresh review, 25/11/2026)", async () => {
    sameAmount = { provider: 1, person: 0 };
    const r = await send("400");
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining("A refund of R400 is already recorded on this gift (the payment provider told us about it)") });
    // The database was asked to refuse a same-amount refund (it decides while the gift is held: code review 27/11/2026).
    expect(recorded.map((a) => a[5])).toEqual(["refuse"]);
    // A genuinely separate second refund of the same amount: the admin ticks the box.
    expect(await send("400", DONATION, ENTRY, true)).toMatchObject({ ok: true });
    expect(recorded.map((a) => a[5])).toEqual(["refuse", "allow"]);
  });

  it("also when the first one was recorded by hand: the provider's held report must not be typed in again (code review, 26/11/2026)", async () => {
    sameAmount = { provider: 0, person: 1 };
    expect(await send("400")).toMatchObject({ ok: false, message: expect.stringContaining("it was recorded here by hand") });
    sameAmount = { provider: 1, person: 1 };
    expect((await send("400")).ok).toBe(false);
    expect(await send("400", DONATION, ENTRY, true)).toMatchObject({ ok: true });
    expect(recorded.map((a) => a[5])).toEqual(["refuse", "refuse", "allow"]);
  });

  it("needs a platform admin, as the other payment actions do", async () => {
    admin = false;
    await expect(send("400")).rejects.toThrow("not allowed");
    await expect(clearHold(DONATION)).rejects.toThrow("not allowed");
    expect(recorded).toEqual([]);
    admin = true;
    await clearHold(DONATION);
    expect(recorded).toEqual([["clear", DONATION, "admin-1"]]);
  });
});
