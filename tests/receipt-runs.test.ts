/** The yearly receipt run with two approvals: what the charity approves is exactly what is issued. */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { describeDone, describeUndone, isActionKind, pageOf } from "@/lib/charity/done";
import { runReceiptsJob, type IssuedReceipt, type JobSummary, type ReceiptStore } from "@/lib/receipts/issue";
import { buildReceiptDetails, type CharityRow, type DonorRow } from "@/lib/receipts/details";
import type { PlanCharity, PlanDonation } from "@/lib/receipts/plan";
import { closedTaxYears, fingerprintPlan, runNeedsFinishing } from "@/lib/receipts/runs";

const r = (donorId: string, ids: string[], cents: number, identity = "") => ({ donorId, donorIdentity: identity, donationIds: ids, totalCents: cents });

describe("the fingerprint of an approved list", () => {
  it("is the same for the same receipts in any order", () => {
    expect(fingerprintPlan([r("u1", ["a", "b"], 100), r("u2", ["c"], 50)])).toBe(fingerprintPlan([r("u2", ["c"], 50), r("u1", ["b", "a"], 100)]));
  });
  it("changes when an amount, a donation, a donor or an identity changes", () => {
    const base = fingerprintPlan([r("u1", ["a"], 100)]);
    expect(fingerprintPlan([r("u1", ["a"], 101)])).not.toBe(base);
    expect(fingerprintPlan([r("u1", ["a", "b"], 100)])).not.toBe(base);
    expect(fingerprintPlan([r("u2", ["a"], 100)])).not.toBe(base);
    expect(fingerprintPlan([r("u1", ["a"], 100, "id-x")])).not.toBe(base);
    expect(fingerprintPlan([r("u1", ["a"], 100), r("u2", ["b"], 1)])).not.toBe(base);
  });
  it("is a 64-character hex string (the database checks it)", () => {
    expect(fingerprintPlan([])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("which tax years can be approved", () => {
  it("the last two that have closed", () => {
    // 21/10/2026 is in tax year 2027 (01/03/2026 to 28/02/2027).
    expect(closedTaxYears(new Date("2026-10-21T10:00:00+02:00"))).toEqual([2026, 2025]);
    // 01/03/2027 starts tax year 2028, so 2027 has just closed.
    expect(closedTaxYears(new Date("2027-03-01T08:00:00+02:00"))).toEqual([2027, 2026]);
  });
});

describe("a finished run that still has work", () => {
  const s = (o: Partial<JobSummary>): JobSummary => ({ taxYear: 2026, mode: "issue", planned: 2, issued: 2, pdfsMade: 2, emailed: 2, emailFailed: 0, skippedByReason: {}, needsAttention: [], checkIdentities: [], failed: [], ...o });
  it("needs finishing when a PDF or an email failed, or a receipt is not emailed yet", () => {
    expect(runNeedsFinishing(s({}))).toBe(false);
    expect(runNeedsFinishing(s({ pdfsMade: 1 }))).toBe(true);
    expect(runNeedsFinishing(s({ emailFailed: 1 }))).toBe(true);
    expect(runNeedsFinishing(s({ failed: [{ what: "PDF", message: "Chrome" }] }))).toBe(true);
    expect(runNeedsFinishing(s({ emailed: 1 }))).toBe(true);
    expect(runNeedsFinishing(null)).toBe(false);
  });
});

describe("finishing never issues a receipt nobody approved", () => {
  const charity: PlanCharity & CharityRow = {
    id: "c1", isS18a: true, mandateSignedAt: "2025-03-09T00:00:00+02:00", quickgive_code: "LTC",
    legal_name_en: "Test Charity NPC", legal_name_he: null, npo_number: "123-456 NPO", pbo_number: "930012345", s18a_reference: "18A/1",
    address_line1: "1 Test Road", address_line2: null, suburb: null, city: "Johannesburg", postal_code: "2192",
  };
  const donor: DonorRow = {
    donor_type: "individual", first_name: "Sarah", last_name: "Levin", organisation_name: null, registration_number: null,
    address_line1: "5 Test Road", address_line2: null, suburb: null, city: "Johannesburg", postal_code: "2192", id_number_last4: "9085", tax_reference_last4: null,
  };
  const gift: PlanDonation = { id: "d1", charityId: "c1", donorId: "u1", donorIdentity: "", taxYear: 2026, amountCents: 50_000, status: "paid", wants18a: true, paidAt: "2025-10-01T10:00:00Z" };

  it("makes the missing PDF and email, issues nothing new, and asks for one charity's receipts only", async () => {
    const asked: (string | undefined)[] = [];
    const already: IssuedReceipt = { id: "r1", reference: "LTC-2026-0001", charityId: "c1", details: buildReceiptDetails({ charity, donor, donations: [{ paidAt: gift.paidAt!, amountCents: gift.amountCents }], taxYear: 2026, periodStart: "2025-03-01", periodEnd: "2026-02-28", issuedAt: new Date() }), pdfPath: null };
    const pdfs = new Set<string>();
    const issue = vi.fn();
    const store: ReceiptStore = {
      listDonations: async (_y, c) => (asked.push(c), [gift]),
      listCharities: async () => [charity],
      receiptedDonationIds: async () => new Set(),
      donorDetailsFor: async () => [{ id: gift.id, paidAt: gift.paidAt!, amountCents: gift.amountCents, recordedMethod: null, donor }],
      issue,
      listIssuedWithoutPdf: async (_y, c) => (asked.push(c), pdfs.has("r1") ? [] : [already]),
      savePdf: async (x) => void pdfs.add(x.id),
      listToEmail: async (_y, c) => (asked.push(c), pdfs.has("r1") ? [{ ...already, pdfPath: "c1/r1.pdf", email: "sarah@example.co.za" }] : []),
      readPdf: async () => Buffer.from("%PDF"),
      claimEmail: async () => true,
      markEmailed: async () => {},
      releaseEmail: async () => {},
    };
    const send = vi.fn(async () => "sent" as const);
    const s = await runReceiptsJob({
      store, taxYear: 2026, today: "2026-10-21", now: new Date(), mode: "finish", charityId: "c1",
      render: async () => Buffer.from("%PDF"), mailer: { transport: { name: "test", send }, siteUrl: "https://givezy.test", platformName: "Givezy" },
    });
    expect(issue).not.toHaveBeenCalled();
    expect(s).toMatchObject({ issued: 0, pdfsMade: 1, emailed: 1 });
    expect(asked).toEqual(["c1", "c1", "c1"]);
  });
});

describe("the dashboard's words for an approval", () => {
  const ctx = { base: "/charity-admin/c1", publicUrl: null, approved: true };
  it("says what was approved, that nothing is issued yet, and can be taken back", () => {
    expect(isActionKind("receipts_approved")).toBe(true);
    expect(pageOf("receipts_approved")).toBe("receipts");
    const d = describeDone("receipts_approved", { taxYear: 2026, receipts: 12, total: "R18 400" }, ctx);
    expect(d.what).toBe("You approved 12 s18A receipts for the 2025/26 tax year, R18 400 in all. Nothing is issued yet: Givezy checks the list and signs it off, then each donor gets their receipt by email.");
    expect(describeUndone("receipts_approved", { taxYear: 2026 })).toMatch(/withdrawn and nothing will be issued/);
    expect(d.what).not.toMatch(/[—!]/);
  });
});

describe("a sign-off never issues more than was approved", () => {
  it("stops before writing anything when the list changed at the last moment", async () => {
    const issue = vi.fn();
    const charity = { id: "c1", isS18a: true, mandateSignedAt: "2025-03-09T00:00:00+02:00", quickgive_code: "LTC", legal_name_en: "T NPC", legal_name_he: null, npo_number: "1", pbo_number: "1", s18a_reference: "1", address_line1: "1 Rd", address_line2: null, suburb: null, city: "Jhb", postal_code: "2000" };
    const gift = { id: "d1", charityId: "c1", donorId: "u1", donorIdentity: "", taxYear: 2026, amountCents: 50_000, status: "paid", wants18a: true, paidAt: "2025-10-01T10:00:00Z" };
    const store = {
      listDonations: async () => [gift], listCharities: async () => [charity], receiptedDonationIds: async () => new Set<string>(),
      donorDetailsFor: async () => [], issue, listIssuedWithoutPdf: async () => [], savePdf: async () => {}, listToEmail: async () => [],
      readPdf: async () => Buffer.from(""), claimEmail: async () => true, markEmailed: async () => {}, releaseEmail: async () => {},
    } as unknown as ReceiptStore;
    const approved = fingerprintPlan([{ donorId: "u1", donorIdentity: "", donationIds: ["other"], totalCents: 1 }]);
    await expect(
      runReceiptsJob({ store, taxYear: 2026, today: "2026-10-21", now: new Date(), mode: "issue", render: async () => Buffer.from(""), checkPlan: (r) => { if (fingerprintPlan(r) !== approved) throw new Error("changed"); } }),
    ).rejects.toThrow("changed");
    expect(issue).not.toHaveBeenCalled();
  });
});

