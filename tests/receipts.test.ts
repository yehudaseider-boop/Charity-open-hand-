/**
 * Annual s18A receipts: who gets one, what is on it, and the job that issues
 * them. No database or Chrome needed (the store and renderer are stand-ins).
 */
import { describe, expect, it, vi } from "vitest";
import { buildReceiptDetails, type CharityRow, type DonorRow } from "@/lib/receipts/details";
import { buildReceiptEmail } from "@/lib/receipts/email";
import { getEmailTransport, maskEmail, type EmailMessage } from "@/lib/email";
import { buildReceiptHtml, esc } from "@/lib/receipts/html";
import { previewReceipts, runReceiptsJob, type IssuedReceipt, type ReceiptStore } from "@/lib/receipts/issue";
import { planReceipts, taxYearIsClosed, type PlanCharity, type PlanDonation } from "@/lib/receipts/plan";

const charity: PlanCharity & CharityRow = {
  id: "c1", isS18a: true, mandateSignedAt: "2026-03-09T00:00:00+02:00", quickgive_code: "LTC",
  legal_name_en: "Linksfield Torah Learning Centre NPC", legal_name_he: "מרכז לימוד תורה",
  npo_number: "123-456 NPO", pbo_number: "930012345", s18a_reference: "18A/2026/1",
  address_line1: "1 Test Road", address_line2: null, suburb: "Linksfield", city: "Johannesburg", postal_code: "2192",
};
const donor: DonorRow = {
  donor_type: "individual", first_name: "Sarah", last_name: "Levin", organisation_name: null, registration_number: null,
  address_line1: "5 Test Road", address_line2: null, suburb: null, city: "Johannesburg", postal_code: "2192",
  id_number_last4: "9085", tax_reference_last4: null,
};
const don = (o: Partial<PlanDonation>): PlanDonation => ({
  id: "d1", charityId: "c1", donorId: "u1", donorIdentity: "", taxYear: 2027, amountCents: 50_000, status: "paid", wants18a: true,
  paidAt: "2026-10-01T10:00:00Z", ...o,
});

describe("who gets a receipt", () => {
  const plan = (donations: PlanDonation[], charities = [charity], already = new Set<string>()) =>
    planReceipts({ taxYear: 2027, donations, charities, alreadyReceipted: already });

  it("makes one receipt per donor per charity, adding up the gift amounts", () => {
    const { receipts } = plan([don({ id: "a", amountCents: 50_000 }), don({ id: "b", amountCents: 18_000 }), don({ id: "c", donorId: "u2", amountCents: 3_000 })]);
    expect(receipts).toHaveLength(2);
    expect(receipts.find((r) => r.donorId === "u1")).toMatchObject({ donationIds: ["a", "b"], totalCents: 68_000 });
    expect(receipts.find((r) => r.donorId === "u2")?.totalCents).toBe(3_000);
  });

  it("never merges two people who share an email (same donor record, different s18A identity)", () => {
    const { receipts } = plan([
      don({ id: "alice", donorIdentity: "id-alice", amountCents: 500_000 }),
      don({ id: "mallory", donorIdentity: "id-mallory", amountCents: 3_000 }),
      don({ id: "alice2", donorIdentity: "id-alice", amountCents: 10_000 }),
    ]);
    expect(receipts).toHaveLength(2);
    expect(receipts.find((r) => r.donorIdentity === "id-alice")).toMatchObject({ donationIds: ["alice", "alice2"], totalCents: 510_000 });
    expect(receipts.find((r) => r.donorIdentity === "id-mallory")).toMatchObject({ donationIds: ["mallory"], totalCents: 3_000 });
  });

  it("keeps different charities apart for the same donor", () => {
    const other = { ...charity, id: "c2" };
    const { receipts } = plan([don({ id: "a" }), don({ id: "b", charityId: "c2" })], [charity, other]);
    expect(receipts).toHaveLength(2);
  });

  it("skips what cannot be receipted, and says why", () => {
    const { receipts, skipped } = plan([
      don({ id: "refunded", status: "refunded" }),
      don({ id: "pending", status: "pending", paidAt: null }),
      don({ id: "no18a", wants18a: false }),
      don({ id: "otheryear", taxYear: 2026 }),
      don({ id: "done" }),
      don({ id: "early", paidAt: "2026-03-01T10:00:00Z" }),
    ], [charity], new Set(["done"]));
    expect(receipts).toHaveLength(0);
    expect(Object.fromEntries(skipped.map((s) => [s.donationId, s.reason]))).toEqual({
      refunded: "not_paid", pending: "not_paid", no18a: "no_18a_requested", otheryear: "wrong_year",
      done: "already_receipted", early: "mandate_after_payment",
    });
  });

  it("issues nothing for a charity without s18A approval or a signed mandate", () => {
    expect(plan([don({})], [{ ...charity, isS18a: false }]).skipped[0].reason).toBe("charity_cannot_issue");
    expect(plan([don({})], [{ ...charity, mandateSignedAt: null }]).skipped[0].reason).toBe("charity_cannot_issue");
  });

  it("only treats a tax year as closed the day after it ends", () => {
    expect(taxYearIsClosed("2027-02-28", "2027-02-28")).toBe(false);
    expect(taxYearIsClosed("2027-02-28", "2027-03-01")).toBe(true);
  });
});

describe("receipt contents", () => {
  const details = buildReceiptDetails({
    charity, donor,
    donations: [{ paidAt: "2026-10-01T10:00:00Z", amountCents: 50_000 }, { paidAt: "2026-09-15T10:00:00Z", amountCents: 18_000 }],
    taxYear: 2027, periodStart: "2026-03-01", periodEnd: "2027-02-28", issuedAt: new Date("2027-03-02T08:00:00Z"),
  });

  it("lists the donations in date order, in dd/mm/yyyy, with the gift amounts only", () => {
    expect(details.donations).toEqual([{ date: "15/09/2026", amount_cents: 18_000 }, { date: "01/10/2026", amount_cents: 50_000 }]);
    expect(details.period).toBe("01/03/2026 to 28/02/2027");
    expect(details.issued_on).toBe("02/03/2027");
  });

  it("keeps only the last 4 digits of the donor's ID number", () => {
    expect(details.donor.id_number_last4).toBe("9085");
    expect(JSON.stringify(details)).not.toMatch(/\d{13}/);
  });

  it("prints amounts in Rand, escapes everything, and marks drafts", () => {
    const html = buildReceiptHtml({ details: { ...details, donor: { ...details.donor, name: '<script>alert("x")</script>' } }, reference: "LTC-2027-0001", draft: true, platformName: "NEDIV lev" });
    expect(html).toContain("R680.00");
    expect(html).toContain("R180.00");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("DRAFT, NOT A TAX RECEIPT");
    expect(html).toContain('lang="he" dir="rtl"');
    expect(html).toContain("•••• 9085");
    expect(buildReceiptHtml({ details, reference: "LTC-2027-0001", platformName: "NEDIV lev" })).not.toContain("DRAFT");
    expect(esc(`a&b"c'`)).toBe("a&amp;b&quot;c&#39;");
  });
});

describe("the yearly job", () => {
  function fakeStore(donations: PlanDonation[]) {
    const issued: IssuedReceipt[] = [];
    const pdfs = new Map<string, Buffer>();
    const emailed = new Set<string>();
    let seq = 0;
    const store: ReceiptStore = {
      listDonations: async () => donations,
      listCharities: async () => [charity],
      receiptedDonationIds: async () => new Set(issued.flatMap(() => [] as string[])),
      donorDetailsFor: async (ids) => ids.map((id) => ({ paidAt: donations.find((d) => d.id === id)!.paidAt!, amountCents: donations.find((d) => d.id === id)!.amountCents, donor })),
      issue: async (r, c, details) => {
        const receipt = { id: `r${++seq}`, reference: `${c.quickgive_code}-${r.taxYear}-000${seq}`, charityId: r.charityId, details, pdfPath: null };
        issued.push(receipt);
        return receipt;
      },
      listIssuedWithoutPdf: async () => issued.filter((r) => !pdfs.has(r.id)),
      savePdf: async (r, pdf) => void pdfs.set(r.id, pdf),
      listToEmail: async () => issued.filter((r) => pdfs.has(r.id) && !emailed.has(r.id)).map((r) => ({ ...r, email: "sarah@example.co.za" })),
      readPdf: async (r) => pdfs.get(r.id)!,
      markEmailed: async (r) => void emailed.add(r.id),
    };
    return { store, issued, pdfs, emailed };
  }
  const render = vi.fn(async () => Buffer.from("%PDF-test"));
  const base = { taxYear: 2027, today: "2027-03-10", now: new Date("2027-03-10T08:00:00Z") };

  it("refuses to run before the tax year has closed", async () => {
    const { store } = fakeStore([don({})]);
    await expect(runReceiptsJob({ store, render, ...base, today: "2027-02-28", mode: "issue" })).rejects.toThrow(/after it closes/);
  });

  it("a dry run writes nothing", async () => {
    const { store, issued } = fakeStore([don({})]);
    const s = await runReceiptsJob({ store, render, ...base, mode: "dry-run" });
    expect(s.planned).toBe(1);
    expect(s.issued).toBe(0);
    expect(issued).toHaveLength(0);
  });

  it("issues each receipt and makes its PDF", async () => {
    const { store, issued, pdfs } = fakeStore([don({ id: "a" }), don({ id: "b", donorId: "u2" })]);
    const s = await runReceiptsJob({ store, render, ...base, mode: "issue" });
    expect(s).toMatchObject({ planned: 2, issued: 2, pdfsMade: 2 });
    expect(issued).toHaveLength(2);
    expect(pdfs.size).toBe(2);
  });

  it("makes the PDF on the next run if it failed the first time", async () => {
    const { store, issued, pdfs } = fakeStore([don({ id: "a" })]);
    render.mockRejectedValueOnce(new Error("Chrome crashed"));
    await expect(runReceiptsJob({ store, render, ...base, mode: "issue" })).rejects.toThrow(/Chrome crashed/);
    expect(issued).toHaveLength(1);
    expect(pdfs.size).toBe(0);
    // The second run finds the receipt is already issued (the store now reports its donations) and only makes the PDF.
    store.receiptedDonationIds = async () => new Set(["a"]);
    const again = await runReceiptsJob({ store, render, ...base, mode: "issue" });
    expect(again).toMatchObject({ planned: 0, issued: 0, pdfsMade: 1 });
    expect(issued).toHaveLength(1);
    expect(pdfs.size).toBe(1);
  });

  it("flags paid donations a charity can no longer receipt", async () => {
    const { store } = fakeStore([don({ id: "a" })]);
    store.listCharities = async () => [{ ...charity, isS18a: false }];
    const s = await runReceiptsJob({ store, render, ...base, mode: "dry-run" });
    expect(s.needsAttention).toEqual([{ donationId: "a", reason: "charity_cannot_issue" }]);
  });

  it("previews receipts without writing anything", async () => {
    const { store, issued } = fakeStore([don({ id: "a" })]);
    const list = await previewReceipts({ store, taxYear: 2027, now: base.now });
    expect(list).toHaveLength(1);
    expect(list[0].reference).toMatch(/^PREVIEW-LTC-2027-0001$/);
    expect(issued).toHaveLength(0);
  });
});

describe("emailing receipts", () => {
  const base = { taxYear: 2027, today: "2027-03-10", now: new Date("2027-03-10T08:00:00Z"), mode: "issue" as const };
  const render = async () => Buffer.from("%PDF-test");
  const sentTo = () => {
    const sent: EmailMessage[] = [];
    const transport = { name: "test", send: async (m: EmailMessage) => void sent.push(m) };
    return { sent, mailer: { transport, siteUrl: "https://example.co.za", platformName: "NEDIV lev" } };
  };

  function setup(donations: PlanDonation[]) {
    const issued: IssuedReceipt[] = [];
    const pdfs = new Map<string, Buffer>();
    const emailed = new Set<string>();
    const receipted = new Set<string>();
    let seq = 0;
    const store: ReceiptStore = {
      listDonations: async () => donations,
      listCharities: async () => [charity],
      receiptedDonationIds: async () => receipted,
      donorDetailsFor: async (ids) => ids.map((id) => ({ paidAt: donations.find((d) => d.id === id)!.paidAt!, amountCents: donations.find((d) => d.id === id)!.amountCents, donor })),
      issue: async (r, c, details) => {
        r.donationIds.forEach((id) => receipted.add(id));
        const receipt = { id: `r${++seq}`, reference: `${c.quickgive_code}-${r.taxYear}-000${seq}`, charityId: r.charityId, details, pdfPath: null };
        issued.push(receipt);
        return receipt;
      },
      listIssuedWithoutPdf: async () => issued.filter((r) => !pdfs.has(r.id)),
      savePdf: async (r, pdf) => void pdfs.set(r.id, pdf),
      listToEmail: async () => issued.filter((r) => pdfs.has(r.id) && !emailed.has(r.id)).map((r) => ({ ...r, email: `donor-${r.id}@example.co.za` })),
      readPdf: async (r) => pdfs.get(r.id)!,
      markEmailed: async (r) => void emailed.add(r.id),
    };
    return { store, emailed };
  }

  it("emails each donor their receipt with the PDF attached, once", async () => {
    const { store, emailed } = setup([don({ id: "a" }), don({ id: "b", donorId: "u2" })]);
    const { sent, mailer } = sentTo();
    const first = await runReceiptsJob({ store, render, ...base, mailer });
    expect(first).toMatchObject({ issued: 2, emailed: 2, emailFailed: 0 });
    expect(sent).toHaveLength(2);
    expect(sent[0].attachments?.[0]).toMatchObject({ filename: "LTC-2027-0001.pdf", contentType: "application/pdf" });
    expect(sent[0].subject).toBe("Your section 18A receipt LTC-2027-0001 from Linksfield Torah Learning Centre NPC");
    expect(emailed.size).toBe(2);
    // Running it again sends nothing more.
    const again = await runReceiptsJob({ store, render, ...base, mailer });
    expect(again.emailed).toBe(0);
    expect(sent).toHaveLength(2);
  });

  it("sends no email unless asked to", async () => {
    const { store } = setup([don({ id: "a" })]);
    const s = await runReceiptsJob({ store, render, ...base });
    expect(s).toMatchObject({ issued: 1, emailed: 0 });
  });

  it("one failed email does not stop the others, and is tried again next run", async () => {
    const { store, emailed } = setup([don({ id: "a" }), don({ id: "b", donorId: "u2" })]);
    const sent: string[] = [];
    let fail = true;
    const transport = { name: "test", send: async (m: EmailMessage) => { if (fail && m.to.includes("r1")) throw new Error("provider down"); sent.push(m.to); } };
    const mailer = { transport, siteUrl: "https://example.co.za", platformName: "NEDIV lev" };
    const first = await runReceiptsJob({ store, render, ...base, mailer });
    expect(first).toMatchObject({ emailed: 1, emailFailed: 1 });
    expect([...emailed]).toEqual(["r2"]);
    fail = false;
    const second = await runReceiptsJob({ store, render, ...base, mailer });
    expect(second.emailed).toBe(1);
    expect(emailed.size).toBe(2);
  });

  it("the email names the receipt and the total, and escapes names", () => {
    const details = buildReceiptDetails({
      charity, donor: { ...donor, first_name: "<b>Sarah</b>" },
      donations: [{ paidAt: "2026-10-01T10:00:00Z", amountCents: 50_000 }, { paidAt: "2026-09-15T10:00:00Z", amountCents: 18_000 }],
      taxYear: 2027, periodStart: "2026-03-01", periodEnd: "2027-02-28", issuedAt: new Date("2027-03-02T08:00:00Z"),
    });
    const m = buildReceiptEmail({ details, reference: "LTC-2027-0001", siteUrl: "https://example.co.za/", platformName: "NEDIV lev" });
    expect(m.text).toContain("Total donated: R680.00");
    expect(m.text).toContain("https://example.co.za/account");
    expect(m.html).not.toContain("<b>Sarah</b>");
    expect(m.html).toContain("&lt;b&gt;Sarah");
  });
});

describe("email adapter", () => {
  it("defaults to a console transport that only logs, with the address masked", () => {
    expect(getEmailTransport({}).name).toBe("console");
    expect(maskEmail("sarah@example.co.za")).toBe("s•••@example.co.za");
  });
  it("needs a key and a sender for Resend, and refuses unknown names", () => {
    expect(() => getEmailTransport({ EMAIL_TRANSPORT: "resend" })).toThrow(/RESEND_API_KEY/);
    expect(getEmailTransport({ EMAIL_TRANSPORT: "resend", RESEND_API_KEY: "k", EMAIL_FROM: "a@b.co.za" }).name).toBe("resend");
    expect(() => getEmailTransport({ EMAIL_TRANSPORT: "carrier-pigeon" })).toThrow(/Unknown/);
  });
});
