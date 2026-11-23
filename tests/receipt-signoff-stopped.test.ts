/**
 * Review 23/11/2026: a sign-off whose job stopped part way (an error between receipts) is marked done with what it
 * really issued and made, counted from the receipts themselves as "mark stopped" does, never written as none.
 * The database is a stand-in.
 */
import { describe, expect, it, vi } from "vitest";
import type { CharityRow } from "@/lib/receipts/details";
import type { PlanCharity, PlanDonation } from "@/lib/receipts/plan";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/config/receipts", async (orig) => ({ ...(await orig<object>()), receiptsEnabled: () => true }));
vi.mock("@/lib/receipts/issue", async (orig) => ({
  ...(await orig<object>()),
  runReceiptsJob: async () => {
    throw new Error("A void receipt cannot be changed");
  },
}));

const charity: PlanCharity & CharityRow = {
  id: "c1", isS18a: true, mandateSignedAt: "2026-04-01T00:00:00+02:00", s18aPeriods: [{ startedAt: "2026-04-01T00:00:00+02:00", endedAt: null }], quickgive_code: "NMF",
  legal_name_en: "Northcliff Meals Fund NPC", npo_number: "1", pbo_number: "930012345", s18a_reference: "18A/1",
  address_line1: "1 Main Road", address_line2: null, suburb: null, city: "Johannesburg", postal_code: "2192",
};
const gift = (id: string): PlanDonation => ({ id, charityId: "c1", donorId: `u-${id}`, donorIdentity: "", taxYear: 2027, amountCents: 50_000, status: "paid", wants18a: true, paidAt: "2026-06-01T10:00:00Z" });
const donations = [gift("g1"), gift("g2"), gift("g3")];

vi.mock("@/lib/receipts/store", () => ({
  supabaseReceiptStore: () => ({
    listDonations: async () => donations,
    listCharities: async () => [charity],
    receiptedDonationIds: async () => new Set<string>(),
    listDecisions: async () => [],
  }),
}));

let run: Record<string, unknown> | null = null;
const runPatches: Record<string, unknown>[] = [];
const receiptCounts: Record<string, unknown>[] = [];

function query(table: string) {
  let ids: string[] = [];
  let patch: Record<string, unknown> | null = null;
  const filters: Record<string, unknown> = {};
  const answer = () => {
    if (table === "donations") return { data: ids.map((id) => ({ id, paid_at: "2026-06-01T10:00:00Z", donation_checkout_details: { donor_type: "individual", first_name: "Ann", last_name: "Smith", organisation_name: null } })), error: null };
    if (table === "receipt_runs") {
      if (patch) {
        runPatches.push(patch);
        return { data: [{ id: "run1" }], error: null };
      }
      return { data: run, error: null };
    }
    if (table === "s18a_receipts") {
      receiptCounts.push({ ...filters });
      // Two receipts issued since the sign-off, one of them with its PDF.
      return { data: null, count: filters.pdf_path ? 1 : 2, error: null };
    }
    return { data: null, error: null };
  };
  const b: Record<string, unknown> = {};
  for (const m of ["select", "is", "order", "range", "lt", "limit"]) b[m] = () => b;
  b.eq = (c: string, v: unknown) => ((filters[c] = v), b);
  b.gte = (c: string, v: unknown) => ((filters[`${c}>=`] = v), b);
  b.not = (c: string) => ((filters[c] = "not null"), b);
  b.in = (_c: string, v: string[]) => ((ids = v), b);
  b.update = (p: Record<string, unknown>) => ((patch = p), b);
  for (const m of ["insert", "upsert", "delete"]) b[m] = () => b;
  b.maybeSingle = async () => answer();
  b.single = async () => answer();
  b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(answer()).then(res, rej);
  return b;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (t: string) => query(t) }) }));

const { loadPlan, signOffRun } = await import("@/lib/receipts/runs");

describe("a sign-off that stopped part way", () => {
  it("is marked done with the receipts it really issued and the PDFs it made, not none", async () => {
    const plan = await loadPlan("c1", 2027);
    run = { id: "run1", charity_id: "c1", tax_year: 2027, status: "charity_approved", plan_fingerprint: plan.fingerprint, receipts_planned: 3, total_cents: 150_000 };
    const now = new Date("2027-03-05T08:00:00+02:00");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await signOffRun({ runId: "run1", userId: "givezy1", now });
    err.mockRestore();
    expect(r).toMatchObject({ ok: true, summary: { planned: 3, issued: 2, pdfsMade: 1, emailed: 0, failed: [{ what: "the run", message: "A void receipt cannot be changed" }] } });
    const done = runPatches.find((p) => p.status === "done");
    expect(done?.summary).toMatchObject({ issued: 2, pdfsMade: 1 });
    // Counted for this charity and year, issued receipts only, from the sign-off on.
    expect(receiptCounts[0]).toMatchObject({ charity_id: "c1", tax_year: 2027, status: "issued", "issued_at>=": now.toISOString() });
  });
});
