/**
 * Speed audit of 24/11/2026: pages that waited for reads one after another where they could go side by side. Same
 * pattern as dashboard-round-trips.test.ts (tests/stubs/round-trips.ts): each wait is one round, and reads that don't
 * depend on each other must share one.
 */
import { describe, expect, it, vi } from "vitest";
import { answerWith, fakeDb, has, nextRound, rounds, sent } from "./stubs/round-trips";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeDb }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeDb }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
// The rule for "does the daily job carry the rest on" is read from the database: one trip, as in the real thing.
vi.mock("@/lib/charity/carry-on-sends", async (orig) => ({ ...(await orig<object>()), carryOnState: () => nextRound(() => "goes") }));

const { thankYouRecipients } = await import("@/lib/charity/thank-you-send");
const { thankDonorsCounts } = await import("@/lib/charity/thank-you-page");
const { decidedPlan } = await import("@/lib/receipts/runs");
const { adminReceiptsReads } = await import("@/lib/receipts/admin-reads");

const gift = { id: "g1", donor_id: "d1", amount_cents: 10_000, refunded_cents: 0, donation_checkout_details: { email: "a@x.co", first_name: "Ann", erased_at: null } };

describe("Thank donors", () => {
  it("counts a month's donors with the two opt-out lists asked together: two rounds, not three", async () => {
    answerWith((table) => (table === "donations" ? { data: [gift], error: null } : { data: [], error: null }));
    const { result, rounds: n } = await rounds(() => thankYouRecipients("c1", "2026-11-01"));
    expect(n).toBe(2);
    expect(result.map((r) => r.email)).toEqual(["a@x.co"]);
  });

  it("counts the unfinished month, its carry-on rule and the open months together: two rounds, not five", async () => {
    answerWith((table) => (table === "donations" ? { data: [gift], error: null } : { data: [], error: null }));
    const sentRows = [{ id: "t1", period_month: "2026-10-01", sent_at: "2026-11-02T10:00:00Z", sent_by: "u1", recipient_count: 0, finished_at: null }];
    const { result, rounds: n } = await rounds(() => thankDonorsCounts({ charityId: "c1", pageLive: true, sent: sentRows, openMonths: ["2026-11-01", "2026-09-01"] }));
    expect(n).toBe(2);
    expect(result.unfinished).toMatchObject([{ month: "2026-10-01", total: 1, carryOn: "goes" }]);
    expect(result.open.map((o) => o.count)).toEqual([1, 1]);
  });
});

describe("the receipts plan (Admin, Receipts and the certificate page)", () => {
  const donation = { id: "g1", charity_id: "c1", donor_id: "d1", tax_year: 2026, amount_cents: 10_000, refunded_cents: 0, receipt_hold: null, status: "paid", wants_18a: true, paid_at: "2026-03-01T10:00:00Z", donation_checkout_details: { receipt_identity: "id:1", erased_at: null, donor_type: "individual" } };

  it("reads the gifts, the already-receipted gifts and the decisions side by side: three rounds, not four", async () => {
    answerWith((table) => (table === "donations" ? { data: [donation], error: null } : { data: [], error: null }));
    const { rounds: n } = await rounds(() => decidedPlan("c1", 2026));
    // gifts + receipted + decisions (1), the charity (2), its s18A periods (3)
    expect(n).toBe(3);
  });

  it("asks for one charity's receipted gifts only, not every charity's", async () => {
    answerWith(() => ({ data: [], error: null }));
    await rounds(() => decidedPlan("c1", 2026));
    const receipted = sent.find((s) => s.table === "s18a_receipt_donations");
    expect(receipted && has(receipted.calls, "eq", "s18a_receipts.charity_id", "c1")).toBe(true);
  });
});

describe("Admin, Receipts", () => {
  it("reads the run, the list, the boards, each waiting run's count and its plan in two rounds (was four with nothing to plan, more with gifts)", async () => {
    const run = { id: "r1", charity_id: "c1", tax_year: 2026, status: "charity_approved", charity_approved_at: "2026-05-01T10:00:00Z", charities: { name_en: "Meals" } };
    answerWith((table, calls) => {
      if (table === "receipt_runs") return { data: has(calls, "in", "status", ["charity_approved", "issuing"]) ? [run] : [], error: null };
      return { data: [], error: null, count: 0 };
    });
    const list = (fakeDb.from("s18a_receipts") as unknown as { select: (c: string) => PromiseLike<unknown> }).select("id");
    const { result, rounds: n } = await rounds(() => adminReceiptsReads({ runId: null, list }));
    expect(result.waiting).toHaveLength(1);
    expect(result.plans).toHaveLength(1);
    // Round 1: the list and the four boards. Round 2: each waiting run's year-end count and its plan, together.
    expect(n).toBe(2);
  });
});
