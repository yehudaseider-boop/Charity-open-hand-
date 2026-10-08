/**
 * The yearly receipts job. It does not talk to the database or Chrome
 * directly: it works through a store and a renderer, so it can be tested
 * without either, and run from a script (not from a web request).
 *
 * Safe to run again: a donor never gets two issued receipts for the same
 * charity and tax year, and a receipt whose PDF failed gets its PDF made on
 * the next run.
 */
import { taxYearRange } from "@/lib/dates";
import { buildReceiptDetails, type CharityRow, type DonorRow, type ReceiptDetails } from "./details";
import { planReceipts, taxYearIsClosed, type PlanCharity, type PlanDonation, type PlannedReceipt, type Skipped } from "./plan";

export type IssuedReceipt = { id: string; reference: string; charityId: string; details: ReceiptDetails; pdfPath: string | null };

export interface ReceiptStore {
  listDonations(taxYear: number): Promise<PlanDonation[]>;
  listCharities(ids: string[]): Promise<(PlanCharity & CharityRow)[]>;
  receiptedDonationIds(taxYear: number): Promise<Set<string>>;
  /** The donor details typed with a donation, plus when it was paid. */
  donorDetailsFor(donationIds: string[]): Promise<{ paidAt: string; amountCents: number; donor: DonorRow }[]>;
  issue(receipt: PlannedReceipt, charity: CharityRow, details: ReceiptDetails): Promise<IssuedReceipt>;
  listIssuedWithoutPdf(taxYear: number): Promise<IssuedReceipt[]>;
  savePdf(receipt: IssuedReceipt, pdf: Buffer): Promise<void>;
}

export type Renderer = (receipt: { details: ReceiptDetails; reference: string }) => Promise<Buffer>;

export type JobMode = "dry-run" | "issue";

export type JobSummary = {
  taxYear: number;
  mode: JobMode;
  planned: number;
  issued: number;
  pdfsMade: number;
  skippedByReason: Record<string, number>;
  /** Paid, 18A-requested donations that could not go on a receipt, for a person to look at. */
  needsAttention: Skipped[];
};

export async function runReceiptsJob(args: {
  store: ReceiptStore;
  render: Renderer;
  taxYear: number;
  /** Today as yyyy-mm-dd in Johannesburg time. */
  today: string;
  now: Date;
  mode: JobMode;
}): Promise<JobSummary> {
  const { store, taxYear } = args;
  const { start, end } = taxYearRange(taxYear);
  if (!taxYearIsClosed(end, args.today)) {
    throw new Error(`Tax year ${taxYear} ends on ${end.split("-").reverse().join("/")}. Receipts are issued after it closes.`);
  }

  const donations = await store.listDonations(taxYear);
  const charities = await store.listCharities([...new Set(donations.map((d) => d.charityId))]);
  const already = await store.receiptedDonationIds(taxYear);
  const { receipts, skipped } = planReceipts({ taxYear, donations, charities, alreadyReceipted: already });

  const summary: JobSummary = {
    taxYear,
    mode: args.mode,
    planned: receipts.length,
    issued: 0,
    pdfsMade: 0,
    skippedByReason: {},
    needsAttention: skipped.filter((s) => s.reason === "charity_cannot_issue" || s.reason === "mandate_after_payment"),
  };
  for (const s of skipped) summary.skippedByReason[s.reason] = (summary.skippedByReason[s.reason] ?? 0) + 1;
  if (args.mode === "dry-run") return summary;

  const charityById = new Map(charities.map((c) => [c.id, c]));
  for (const r of receipts) {
    const charity = charityById.get(r.charityId)!;
    const rows = await store.donorDetailsFor(r.donationIds);
    if (rows.length === 0) throw new Error("No donor details found for a planned receipt");
    // Donor details come from the most recent donation in the year.
    const latest = [...rows].sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())[0];
    const details = buildReceiptDetails({
      charity,
      donor: latest.donor,
      donations: rows,
      taxYear,
      periodStart: start,
      periodEnd: end,
      issuedAt: args.now,
    });
    const issued = await store.issue(r, charity, details);
    summary.issued += 1;
    await store.savePdf(issued, await args.render({ details: issued.details, reference: issued.reference }));
    summary.pdfsMade += 1;
  }

  // Receipts issued earlier whose PDF failed or was never made.
  for (const missing of await store.listIssuedWithoutPdf(taxYear)) {
    await store.savePdf(missing, await args.render({ details: missing.details, reference: missing.reference }));
    summary.pdfsMade += 1;
  }
  return summary;
}

/**
 * Receipts as they would be issued, without writing anything: for checking
 * the layout and the totals. Works for any tax year, open or closed.
 */
export async function previewReceipts(args: { store: ReceiptStore; taxYear: number; now: Date }) {
  const { store, taxYear } = args;
  const { start, end } = taxYearRange(taxYear);
  const donations = await store.listDonations(taxYear);
  const charities = await store.listCharities([...new Set(donations.map((d) => d.charityId))]);
  const { receipts } = planReceipts({ taxYear, donations, charities, alreadyReceipted: await store.receiptedDonationIds(taxYear) });
  const charityById = new Map(charities.map((c) => [c.id, c]));
  const out: { reference: string; details: ReceiptDetails }[] = [];
  for (const [i, r] of receipts.entries()) {
    const charity = charityById.get(r.charityId)!;
    const rows = await store.donorDetailsFor(r.donationIds);
    const latest = [...rows].sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())[0];
    out.push({
      reference: `PREVIEW-${charity.quickgive_code}-${taxYear}-${String(i + 1).padStart(4, "0")}`,
      details: buildReceiptDetails({ charity, donor: latest.donor, donations: rows, taxYear, periodStart: start, periodEnd: end, issuedAt: args.now }),
    });
  }
  return out;
}
