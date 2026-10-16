/**
 * The donor's annual tax pack: every paid donation in one tax year (1 March to the end of February,
 * Johannesburg time), which ones go on an s18A receipt, the totals, and the receipts already issued.
 * Pure: the page and the CSV both build on this, and the tests check it. Money stays in whole cents.
 * Donations only: an optional contribution to Givezy is a separate payment and is not listed here.
 */
import { taxYearFor } from "@/lib/dates";
import { cleanLabel } from "@/lib/donations/labels";

export type PackDonationRow = {
  id: string;
  paidAt: string;
  charityName: string;
  amountCents: number | string;
  /** The donor asked for an s18A receipt (only possible with an s18A charity). */
  wants18a: boolean;
  monthly: boolean;
  /** The donor's own private label for the gift, if any. */
  label: string | null;
  /** Shown as "In honour of ..." or "In memory of ...", if the donor added one. */
  dedication?: string | null;
};

export type PackReceiptRow = { charityName: string | null; reference: string | null; amountCents: number | string; issuedAt: string; status: string };

export type PackLine = {
  id: string;
  paidAt: string;
  charityName: string;
  cents: number;
  /** The donor asked for an s18A receipt. */
  s18a: boolean;
  /** It is on an issued s18A receipt (only known once the tax year's receipts exist). */
  receipted: boolean;
  monthly: boolean;
  label: string | null;
  dedication: string | null;
};
export type PackCharity = { name: string; cents: number; count: number; s18aCents: number };
export type TaxPack = {
  taxYear: number;
  lines: PackLine[];
  totalCents: number;
  /** Asked for an s18A receipt. */
  s18aCents: number;
  otherCents: number;
  /** On issued s18A receipts (what counts for tax once the year's receipts are out). */
  receiptedCents: number;
  byCharity: PackCharity[];
  /** Totals by the donor's own labels, largest first; gifts without one are under "No label". */
  byLabel: { label: string; cents: number }[];
  receipts: { charityName: string; reference: string | null; cents: number; issuedAt: string }[];
};

/** A tax year we can ask for: a whole number in a sensible range. */
export function parseTaxYear(raw: string): number | null {
  if (!/^\d{4}$/.test(raw)) return null;
  const y = Number(raw);
  return y >= 2020 && y <= 2100 ? y : null;
}

export function buildTaxPack(taxYear: number, donations: PackDonationRow[], receipts: PackReceiptRow[], receiptedIds: ReadonlySet<string> = new Set()): TaxPack {
  const lines: PackLine[] = donations
    .filter((d) => d.paidAt && taxYearFor(d.paidAt) === taxYear)
    .map((d) => ({
      id: d.id,
      paidAt: d.paidAt,
      charityName: d.charityName,
      cents: Number(d.amountCents),
      s18a: d.wants18a,
      receipted: receiptedIds.has(d.id),
      monthly: d.monthly,
      label: cleanLabel(d.label),
      dedication: d.dedication?.trim() ? d.dedication.trim() : null,
    }))
    .sort((a, b) => (a.paidAt < b.paidAt ? -1 : a.paidAt > b.paidAt ? 1 : a.id < b.id ? -1 : 1));

  const totalCents = lines.reduce((t, l) => t + l.cents, 0);
  const s18aCents = lines.filter((l) => l.s18a).reduce((t, l) => t + l.cents, 0);
  const receiptedCents = lines.filter((l) => l.receipted).reduce((t, l) => t + l.cents, 0);
  const charities = new Map<string, PackCharity>();
  for (const l of lines) {
    const c = charities.get(l.charityName) ?? { name: l.charityName, cents: 0, count: 0, s18aCents: 0 };
    c.cents += l.cents;
    c.count += 1;
    if (l.s18a) c.s18aCents += l.cents;
    charities.set(l.charityName, c);
  }
  // Labels are grouped whatever their case ("maaser" with "Maaser"), shown as first written.
  const labels = new Map<string, { label: string; cents: number }>();
  for (const l of lines) {
    const name = l.label ?? "No label";
    const key = name.toLowerCase();
    const t = labels.get(key) ?? { label: name, cents: 0 };
    t.cents += l.cents;
    labels.set(key, t);
  }
  const byLabel = [...labels.values()].sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label));

  return {
    taxYear,
    lines,
    totalCents,
    s18aCents,
    otherCents: totalCents - s18aCents,
    receiptedCents,
    byCharity: [...charities.values()].sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name)),
    byLabel,
    // Issued receipts for this tax year only; withdrawn ones are not shown.
    receipts: receipts
      .filter((r) => r.status === "issued")
      .map((r) => ({ charityName: r.charityName ?? "Charity", reference: r.reference, cents: Number(r.amountCents), issuedAt: r.issuedAt }))
      .sort((a, b) => a.charityName.localeCompare(b.charityName)),
  };
}
