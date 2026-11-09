/**
 * The charity checks each s18A receipt before the yearly run (CRM build plan step 1, 09/11/2026): where each
 * certificate stands, what the run's fingerprint covers, what the issuing job leaves out, what a correction may
 * change, and the words. No database needed.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { buildReceiptDetails, type CharityRow, type DonorRow } from "@/lib/receipts/details";
import { buildReceiptHtml } from "@/lib/receipts/html";
import { runReceiptsJob, type IssuedReceipt, type ReceiptStore } from "@/lib/receipts/issue";
import { planReceipts, type PlanCharity, type PlanDonation, type PlannedReceipt } from "@/lib/receipts/plan";
import {
  applyDecisions, buildDeclineEmail, certificateFingerprint, certificateKey, changedParts, checkCertificateEdit, countStatuses, editRows, fieldsFor,
  willIssue, type StoredDecision,
} from "@/lib/receipts/review";
import { fingerprintPlan } from "@/lib/receipts/runs";
import { ASK_FIRST, describeDone, describeUndone, isActionKind, pageOf } from "@/lib/charity/done";

const charity: PlanCharity & CharityRow = {
  id: "c1", isS18a: true, mandateSignedAt: "2026-03-09T00:00:00+02:00", quickgive_code: "NMF",
  legal_name_en: "Northcliff Meals Fund NPC", npo_number: "123-456 NPO", pbo_number: "930012345", s18a_reference: "18A/2026/1",
  address_line1: "1 Test Road", address_line2: null, suburb: "Northcliff", city: "Johannesburg", postal_code: "2195",
};
const donor: DonorRow = {
  donor_type: "individual", first_name: "Thandi", last_name: "Mokoena", organisation_name: null, registration_number: null,
  address_line1: "5 Test Road", address_line2: null, suburb: null, city: "Johannesburg", postal_code: "2192", id_number_last4: "9085", tax_reference_last4: null,
};
const don = (o: Partial<PlanDonation>): PlanDonation => ({
  id: "d1", charityId: "c1", donorId: "u1", donorIdentity: "", taxYear: 2027, amountCents: 50_000, status: "paid", wants18a: true, paidAt: "2026-10-01T10:00:00Z", ...o,
});
const plan = (donations: PlanDonation[]) => planReceipts({ taxYear: 2027, donations, charities: [charity], alreadyReceipted: new Set() }).receipts;
const decision = (r: PlannedReceipt, d: StoredDecision["decision"], o: Partial<StoredDecision> = {}): StoredDecision => ({
  id: `dec-${r.donorId}`, charityId: r.charityId, taxYear: r.taxYear, donorId: r.donorId, donorIdentity: r.donorIdentity, decision: d,
  certificateFingerprint: certificateFingerprint(r), decidedAt: "2027-03-02T08:00:00.000000+00:00", ...o,
});

describe("where each planned certificate stands", () => {
  const gifts = [don({ id: "a", donorId: "u1" }), don({ id: "b", donorId: "u2" }), don({ id: "c", donorId: "u3" }), don({ id: "d", donorId: "u4" })];
  const receipts = plan(gifts);
  const [r1, r2, r3] = receipts;

  it("is to check without a decision, and approved, edited or declined with one", () => {
    const out = applyDecisions(receipts, [decision(r1, "approved"), decision(r2, "edited"), decision(r3, "declined")]);
    expect(out.map((r) => r.status)).toEqual(["approved", "edited", "declined", "to_check"]);
    expect(out.filter(willIssue).map((r) => r.donorId)).toEqual(["u1", "u2"]);
    expect(countStatuses(out)).toEqual({ to_check: 1, approved: 1, edited: 1, declined: 1 });
  });

  it("an approval of a certificate whose gifts changed since is to check again; a decline holds", () => {
    const later = plan([...gifts, don({ id: "late", donorId: "u1", amountCents: 1_000 }), don({ id: "late2", donorId: "u3" })]);
    const out = applyDecisions(later, [decision(r1, "approved"), decision(r3, "declined")]);
    expect(out[0]).toMatchObject({ donorId: "u1", status: "to_check", changedSince: true, decidedAt: null });
    expect(out.find((r) => r.donorId === "u3")).toMatchObject({ status: "declined", changedSince: false });
  });

  it("matches a decision to the same donor, identity and tax year only", () => {
    const other = { ...decision(r1, "approved"), donorIdentity: "someone-else" };
    const lastYear = { ...decision(r2, "approved"), taxYear: 2026 };
    expect(applyDecisions(receipts, [other, lastYear]).every((r) => r.status === "to_check")).toBe(true);
  });

  it("gives each certificate a key that carries neither the donor record nor the identity fingerprint", () => {
    const k = certificateKey("c1", 2027, "donor-uuid", "identity-fingerprint-xyz");
    expect(k).toMatch(/^[0-9a-f]{32}$/);
    expect(k).toBe(certificateKey("c1", 2027, "donor-uuid", "identity-fingerprint-xyz"));
    expect(k).not.toBe(certificateKey("c2", 2027, "donor-uuid", "identity-fingerprint-xyz"));
    expect(k).not.toBe(certificateKey("c1", 2026, "donor-uuid", "identity-fingerprint-xyz"));
    expect(k).not.toContain("donor-uuid");
  });
});

describe("the run's fingerprint includes each certificate's decision", () => {
  const receipts = plan([don({ id: "a", donorId: "u1" }), don({ id: "b", donorId: "u2" })]);
  const [r1, r2] = receipts;
  const fp = (ds: StoredDecision[]) => fingerprintPlan(applyDecisions(receipts, ds));

  it("changes when a certificate is approved, declined, edited or reopened, or decided again", () => {
    const approvedBoth = fp([decision(r1, "approved"), decision(r2, "approved")]);
    expect(fp([decision(r1, "approved"), decision(r2, "declined")])).not.toBe(approvedBoth);
    expect(fp([decision(r1, "approved"), decision(r2, "edited")])).not.toBe(approvedBoth);
    expect(fp([decision(r1, "approved")])).not.toBe(approvedBoth);
    expect(fp([decision(r1, "approved"), decision(r2, "approved", { decidedAt: "2027-03-02T09:00:00.000000+00:00" })])).not.toBe(approvedBoth);
  });
  it("is the same in any order, and the same for the same decisions", () => {
    const ds = [decision(r1, "approved"), decision(r2, "declined")];
    expect(fingerprintPlan([...applyDecisions(receipts, ds)].reverse())).toBe(fp(ds));
  });
  it("stays as before for a list without decisions (the old runs' fingerprint)", () => {
    expect(fingerprintPlan(receipts)).toBe(fingerprintPlan(receipts.map((r) => ({ ...r }))));
    expect(fingerprintPlan(receipts)).not.toBe(fp([]));
  });
});

describe("the issuing job issues only what the charity approved", () => {
  function store(donations: PlanDonation[], decisions: (receipts: PlannedReceipt[]) => StoredDecision[]) {
    const issued: IssuedReceipt[] = [];
    let seq = 0;
    const s: ReceiptStore = {
      listDonations: async () => donations,
      listCharities: async () => [charity],
      receiptedDonationIds: async () => new Set(),
      listDecisions: async (y) => decisions(planReceipts({ taxYear: y, donations, charities: [charity], alreadyReceipted: new Set() }).receipts),
      donorDetailsFor: async (ids) => ids.map((id) => ({ id, paidAt: donations.find((d) => d.id === id)!.paidAt!, amountCents: donations.find((d) => d.id === id)!.amountCents, recordedMethod: null, donor })),
      issue: async (r, c, details) => {
        const receipt = { id: `r${++seq}`, reference: `${c.quickgive_code}-${r.taxYear}-000${seq}`, charityId: r.charityId, details, pdfPath: null };
        issued.push({ ...receipt, details: { ...details, donor: { ...details.donor, name: r.donorId } } });
        return receipt;
      },
      listIssuedWithoutPdf: async () => [],
      savePdf: async () => {},
      listToEmail: async () => [],
      readPdf: async () => Buffer.from(""),
      claimEmail: async () => true,
      markEmailed: async () => {},
      releaseEmail: async () => {},
    };
    return { s, issued };
  }
  const base = { taxYear: 2027, today: "2027-03-10", now: new Date("2027-03-10T08:00:00Z"), render: async () => Buffer.from("%PDF") };
  const gifts = [don({ id: "a", donorId: "u1" }), don({ id: "b", donorId: "u2" }), don({ id: "c", donorId: "u3" }), don({ id: "d", donorId: "u4" })];

  it("skips declined and still-to-check certificates, and issues approved and edited ones", async () => {
    const { s, issued } = store(gifts, ([r1, r2, r3]) => [decision(r1, "approved"), decision(r2, "edited"), decision(r3, "declined")]);
    const summary = await runReceiptsJob({ ...base, store: s, mode: "issue" });
    expect(issued.map((r) => r.details.donor.name).sort()).toEqual(["u1", "u2"]);
    expect(summary).toMatchObject({ planned: 2, issued: 2 });
    expect(summary.skippedByReason).toEqual({ declined: 1, not_approved: 1 });
    // A charity's own choice is not something for Givezy to look into.
    expect(summary.needsAttention).toEqual([]);
  });

  it("issues nothing that nobody approved, and nothing whose gifts changed since it was approved", async () => {
    const none = store(gifts, () => []);
    expect(await runReceiptsJob({ ...base, store: none.s, mode: "issue" })).toMatchObject({ planned: 0, issued: 0 });
    expect(none.issued).toEqual([]);
    const stale = store(gifts, (rs) => rs.map((r) => decision(r, "approved", { certificateFingerprint: "0".repeat(64) })));
    expect(await runReceiptsJob({ ...base, store: stale.s, mode: "issue" })).toMatchObject({ issued: 0, skippedByReason: { not_approved: 4 } });
  });

  it("shows the sign-off every certificate with its decision before anything is written", async () => {
    const { s, issued } = store(gifts, ([r1, , r3]) => [decision(r1, "approved"), decision(r3, "declined")]);
    let seen: string[] = [];
    await expect(
      runReceiptsJob({ ...base, store: s, mode: "issue", checkPlan: (rs) => { seen = rs.map((r) => `${r.donorId}:${r.status}`); throw new Error("changed"); } }),
    ).rejects.toThrow("changed");
    expect(seen.sort()).toEqual(["u1:approved", "u2:to_check", "u3:declined", "u4:to_check"]);
    expect(issued).toEqual([]);
  });

  it("a dry run still lists every planned certificate (it issues nothing)", async () => {
    const { s } = store(gifts, () => []);
    expect(await runReceiptsJob({ ...base, store: s, mode: "dry-run" })).toMatchObject({ planned: 4, skippedByReason: {} });
  });
});

describe("correcting the donor's details", () => {
  const typed = { first_name: " Thandi‮ ", last_name: "Mokoena-Dlamini", address_line1: "12 New Street", address_line2: "", suburb: "Melville", city: "Johannesburg", postal_code: "2092" };

  it("takes only the name and street address, cleaned, whatever else the form sends", () => {
    const r = checkCertificateEdit({ ...typed, id_number: "8001015009087", tax_reference: "0123456789", registration_number: "2015/123456/07", amount_cents: "1", email: "x@y.co", receipt_identity: "x" }, "individual");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.values).sort()).toEqual(["address_line1", "address_line2", "city", "first_name", "last_name", "organisation_name", "postal_code", "suburb"]);
    expect(r.values).toMatchObject({ first_name: "Thandi", last_name: "Mokoena-Dlamini", address_line2: null, organisation_name: null, postal_code: "2092" });
  });

  it("asks for what SARS needs, in plain words", () => {
    const r = checkCertificateEdit({ first_name: "", last_name: "", address_line1: "", city: "", postal_code: "20" }, "individual");
    expect(r).toEqual({
      ok: false,
      fieldErrors: {
        first_name: "Enter the donor's first name",
        last_name: "Enter the donor's surname",
        address_line1: "Enter the street address. SARS needs it on the receipt",
        city: "Enter the city or town",
        postal_code: "Postal codes are 4 digits",
      },
    });
    expect(checkCertificateEdit({ organisation_name: "", address_line1: "1 Rd", city: "Jhb", postal_code: "2000" }, "company")).toEqual({ ok: false, fieldErrors: { organisation_name: "Enter the registered name" } });
    const long = checkCertificateEdit({ ...typed, first_name: "A".repeat(81) }, "individual");
    expect(long).toEqual({ ok: false, fieldErrors: { first_name: "Please keep the first name to 80 characters or fewer" } });
  });

  it("never names a column outside the name and address, for a person or an organisation", () => {
    const allowed = ["first_name", "last_name", "organisation_name", "address_line1", "address_line2", "suburb", "city", "postal_code"];
    for (const t of ["individual", "company", "trust"] as const) expect(fieldsFor(t).every((f) => allowed.includes(f))).toBe(true);
    expect(fieldsFor("individual")).not.toContain("organisation_name");
    expect(fieldsFor("company")).not.toContain("first_name");
  });

  it("writes only what differs, keeps what it replaced for Undo, and logs only which part changed", () => {
    const r = checkCertificateEdit(typed, "individual");
    if (!r.ok) throw new Error("expected ok");
    const rows = editRows(
      [
        { donationId: "a", current: { first_name: "Thandi", last_name: "Mokoena", address_line1: "5 Old Road", address_line2: null, suburb: null, city: "Johannesburg", postal_code: "2192" } },
        { donationId: "b", current: { first_name: "Thandi", last_name: "Mokoena-Dlamini", address_line1: "12 New Street", address_line2: null, suburb: "Melville", city: "Johannesburg", postal_code: "2092" } },
      ],
      r.values,
      fieldsFor("individual"),
    );
    expect(rows).toEqual([
      {
        donationId: "a",
        before: { last_name: "Mokoena", address_line1: "5 Old Road", suburb: null, postal_code: "2192" },
        after: { last_name: "Mokoena-Dlamini", address_line1: "12 New Street", suburb: "Melville", postal_code: "2092" },
      },
    ]);
    expect(changedParts(rows)).toEqual(["name", "address"]);
    expect(changedParts([{ after: { city: "Durban" } }])).toEqual(["address"]);
    expect(changedParts([])).toEqual([]);
  });
});

describe("the email to a donor whose receipt was declined", () => {
  const mail = buildDeclineEmail({
    donorName: "Thandi Mokoena", donorType: "individual", charityName: "Northcliff Meals Fund", taxYear: 2027, totalCents: 125_000,
    contactPhone: "011 555 0101", contactEmail: "office@meals.org.za", siteUrl: "https://givezy.test/", platformName: "Givezy",
  });

  it("asks them to contact the charity, with its phone number and email, in plain words", () => {
    expect(mail.subject).toBe("Please contact Northcliff Meals Fund about your s18A receipt");
    expect(mail.text).toContain("Dear Thandi,");
    expect(mail.text).toContain("Phone: 011 555 0101");
    expect(mail.text).toContain("Email: office@meals.org.za");
    expect(mail.text).toContain("2026/27 tax year");
    expect(mail.text).toContain("R1 250");
    expect(mail.text).toContain("https://givezy.test/account");
    expect(mail.html).toContain("011 555 0101");
    expect(mail.html).toContain("office@meals.org.za");
  });
  it("has no exclamation marks, no blame and no ID or tax numbers", () => {
    for (const s of [mail.subject, mail.text]) {
      expect(s).not.toContain("!");
      expect(s).not.toMatch(/\d{13}|•••• \d{4}/);
      expect(s).not.toMatch(/fraud|wrong|refused|rejected/i);
    }
  });
  it("greets a company by its name", () => {
    const m = buildDeclineEmail({ donorName: "Acme (Pty) Ltd", donorType: "company", charityName: "X", taxYear: 2027, totalCents: 100, contactPhone: "1", contactEmail: "a@b.co", siteUrl: "https://g.test", platformName: "Givezy" });
    expect(m.text).toContain("Dear Acme (Pty) Ltd,");
  });
});

describe("the preview the charity sees", () => {
  const details = buildReceiptDetails({ charity, donor, donations: [{ paidAt: "2026-10-01T10:00:00Z", amountCents: 50_000, id: "11111111-2222-3333-4444-555555555555" }], taxYear: 2027, periodStart: "2026-03-01", periodEnd: "2027-02-28", issuedAt: new Date("2027-03-10T08:00:00Z") });
  it("is the receipt's own layout, marked as a preview, without any part of the ID number", () => {
    const html = buildReceiptHtml({ details, reference: "Not issued yet", draft: true, mark: "Preview, not issued", hideIdNumbers: true, screen: true, platformName: "Givezy" });
    expect(html).toContain("Preview, not issued");
    expect(html).not.toContain("9085");
    expect(html).toContain("On file (not shown on the dashboard)");
    expect(html).toContain("Thandi Mokoena");
    expect(html).toContain("Donation summary");
  });
  it("leaves the real receipt as it was", () => {
    const html = buildReceiptHtml({ details, reference: "NMF-2027-0001", platformName: "Givezy" });
    expect(html).toContain("•••• 9085");
    expect(html).not.toContain("Preview, not issued");
    expect(html).not.toContain("DRAFT");
    expect(html).not.toContain("@media screen");
  });
});

describe("the dashboard's words for a decision on one receipt", () => {
  const ctx = { base: "/charity-admin/c1", publicUrl: null, approved: true };
  const kinds = ["certificate_approved", "certificate_edited", "certificate_declined", "certificate_reopened"] as const;
  it("belong on the receipts page; a decline can't be taken back, so the page asks first", () => {
    for (const k of kinds) {
      expect(isActionKind(k)).toBe(true);
      expect(pageOf(k)).toBe("receipts");
    }
    expect(ASK_FIRST).toContain("certificate_declined");
    expect(ASK_FIRST).not.toContain("certificate_approved");
    expect(describeUndone("certificate_declined", {})).toBe("This can't be taken back.");
  });
  it("say what happened and point to the next one to check, without exclamation marks", () => {
    const d = { taxYear: 2027, key: "k1", name: "Thandi Mokoena", total: "R500", nextKey: "k2", nextName: "Sipho Ndlovu", emailed: "sent", phone: "011 555 0101", email: "office@meals.org.za", changed: "address", was: "declined" };
    const approved = describeDone("certificate_approved", d, ctx);
    expect(approved.what).toBe("You approved the s18A receipt for Thandi Mokoena, R500 for the 2026/27 tax year. It's issued with your list once Givezy has signed it off.");
    expect(approved.next).toEqual({ label: "Next to check: Sipho Ndlovu", href: "/charity-admin/c1/receipts/certificate?year=2027&c=k2" });
    expect(describeDone("certificate_declined", d, ctx).what).toContain("We've emailed them to contact you on 011 555 0101 or office@meals.org.za.");
    expect(describeDone("certificate_declined", { ...d, emailed: "failed" }, ctx).next).toEqual({ label: "Open the receipt", href: "/charity-admin/c1/receipts/certificate?year=2027&c=k1" });
    expect(describeDone("certificate_edited", d, ctx).what).toContain("corrected the donor's address");
    expect(describeDone("certificate_approved", { ...d, nextKey: undefined }, ctx).next).toEqual({ label: "Back to your list to approve it", href: "/charity-admin/c1/receipts#year-2027" });
    for (const k of kinds) {
      expect(describeDone(k, d, ctx).what).not.toMatch(/[!—]/);
      expect(describeUndone(k, d)).not.toMatch(/[!—]/);
    }
  });
});
