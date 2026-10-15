/**
 * The donor's annual tax pack: every paid donation in one tax year (1 March to the end of February,
 * Johannesburg time), which ones go on an s18A receipt, the totals, and the receipts already issued.
 * Pure: the page and the CSV both build on this, and the tests check it. Money stays in whole cents.
 * Donations only: an optional contribution to Givezy is a separate payment and is not listed here.
 */
import { taxYearFor } from "@/lib/dates";

export type PackKind = "maaser" | "chomesh" | "tzedaka";

export type PackDonationRow = {
  id: string;
  paidAt: string;
  charityName: string;
  amountCents: number | string;
  /** The donor asked for an s18A receipt (only possible with an s18A charity). */
  wants18a: boolean;
  monthly: boolean;
  /** The donor's private maaser / chomesh / tzedaka choice; none recorded counts as general tzedaka. */
  kind: string | null;
  /** Shown as "In honour of ..." or "In memory of ...", if the donor added one. */
  dedication?: string | null;
};

export type PackReceiptRow = { charityName: string | null; reference: string | null; amountCents: number | string; issuedAt: string; status: string };

export type PackLine = { id: string; paidAt: string; charityName: string; cents: number; s18a: boolean; monthly: boolean; kind: PackKind; dedication: string | null };
export type PackCharity = { name: string; cents: number; count: number; s18aCents: number };
export type TaxPack = {
  taxYear: number;
  lines: PackLine[];
  totalCents: number;
  s18aCents: number;
  otherCents: number;
  byCharity: PackCharity[];
  byKind: Record<PackKind, number>;
  receipts: { charityName: string; reference: string | null; cents: number; issuedAt: string }[];
};

const isKind = (k: string | null): k is PackKind => k === "maaser" || k === "chomesh" || k === "tzedaka";

/** A tax year we can ask for: a whole number in a sensible range. */
export function parseTaxYear(raw: string): number | null {
  if (!/^\d{4}$/.test(raw)) return null;
  const y = Number(raw);
  return y >= 2020 && y <= 2100 ? y : null;
}

export function buildTaxPack(taxYear: number, donations: PackDonationRow[], receipts: PackReceiptRow[]): TaxPack {
  const lines: PackLine[] = donations
    .filter((d) => d.paidAt && taxYearFor(d.paidAt) === taxYear)
    .map((d) => ({
      id: d.id,
      paidAt: d.paidAt,
      charityName: d.charityName,
      cents: Number(d.amountCents),
      s18a: d.wants18a,
      monthly: d.monthly,
      kind: isKind(d.kind) ? d.kind : "tzedaka",
      dedication: d.dedication?.trim() ? d.dedication.trim() : null,
    }))
    .sort((a, b) => (a.paidAt < b.paidAt ? -1 : a.paidAt > b.paidAt ? 1 : a.id < b.id ? -1 : 1));

  const totalCents = lines.reduce((t, l) => t + l.cents, 0);
  const s18aCents = lines.filter((l) => l.s18a).reduce((t, l) => t + l.cents, 0);
  const charities = new Map<string, PackCharity>();
  for (const l of lines) {
    const c = charities.get(l.charityName) ?? { name: l.charityName, cents: 0, count: 0, s18aCents: 0 };
    c.cents += l.cents;
    c.count += 1;
    if (l.s18a) c.s18aCents += l.cents;
    charities.set(l.charityName, c);
  }
  const byKind: Record<PackKind, number> = { maaser: 0, chomesh: 0, tzedaka: 0 };
  for (const l of lines) byKind[l.kind] += l.cents;

  return {
    taxYear,
    lines,
    totalCents,
    s18aCents,
    otherCents: totalCents - s18aCents,
    byCharity: [...charities.values()].sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name)),
    byKind,
    // Issued receipts for this tax year only; withdrawn ones are not shown.
    receipts: receipts
      .filter((r) => r.status === "issued")
      .map((r) => ({ charityName: r.charityName ?? "Charity", reference: r.reference, cents: Number(r.amountCents), issuedAt: r.issuedAt }))
      .sort((a, b) => a.charityName.localeCompare(b.charityName)),
  };
}
