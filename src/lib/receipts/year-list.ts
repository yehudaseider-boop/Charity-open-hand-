/**
 * The yearly list of issued s18A receipts for one charity (22/10/2026): a DRAFT to check before the
 * SARS submission (IT3(d)), not the SARS file itself. That file's layout comes from SARS and is not
 * built yet. Pure (tested); whole cents only.
 *
 * Two versions: Givezy's (Admin) shows the last 4 digits of the donor's ID and tax numbers, as printed on
 * the receipt; the charity's shows only whether one is on file, because charities never see any part of
 * them (decided 15/10/2026).
 */
import { centsToPlain } from "@/lib/csv";
import { formatDate, taxYearName } from "@/lib/dates";
import type { ReceiptDetails } from "./details";

export type YearListReceipt = { reference: string | null; issued_at: string; amount_cents: number; details: ReceiptDetails };
export type YearList = { header: string[]; rows: (string | number)[][]; amountColumns: number[]; totalCents: number; count: number; needAttention: number };

/** What SARS will want that this receipt doesn't have. Empty when it looks complete. */
export function gaps(d: ReceiptDetails): string[] {
  const out: string[] = [];
  if (!d.donor.name.trim()) out.push("no donor name");
  if (!d.donor.address.length) out.push("no donor address");
  const person = d.donor.donor_type === "individual";
  const identity = person ? d.donor.id_number_last4 || d.donor.tax_reference_last4 : d.donor.registration_number || d.donor.tax_reference_last4;
  if (!identity) out.push(person ? "no ID or income tax number" : "no registration or income tax number");
  return out;
}

export function yearList(receipts: YearListReceipt[], version: "givezy" | "charity"): YearList {
  const sorted = [...receipts].sort((a, b) => (a.reference ?? "").localeCompare(b.reference ?? "") || a.issued_at.localeCompare(b.issued_at));
  const header = [
    "Receipt", "Issued on", "Tax year", "Donor", "Donor type",
    ...(version === "givezy" ? ["ID number (last 4)", "Income tax number (last 4)"] : ["ID or tax number on file"]),
    "Registration number", "Address", "Gifts", "Amount (R)", "Needs attention",
  ];
  let totalCents = 0;
  let needAttention = 0;
  const rows = sorted.map((r) => {
    const d = r.details;
    const missing = gaps(d);
    if (missing.length) needAttention++;
    totalCents += r.amount_cents;
    const digits = version === "givezy"
      ? [d.donor.id_number_last4 ?? "", d.donor.tax_reference_last4 ?? ""]
      : [d.donor.id_number_last4 || d.donor.tax_reference_last4 ? "Yes" : "No"];
    return [
      r.reference ?? "", formatDate(r.issued_at), taxYearName(Number(d.tax_year)), d.donor.name, d.donor.donor_type,
      ...digits,
      d.donor.registration_number ?? "", d.donor.address.join(", "), d.donations.length, centsToPlain(r.amount_cents),
      missing.length ? missing.join("; ") : "",
    ];
  });
  const amountAt = header.indexOf("Amount (R)");
  const total = header.map((_, i) => (i === 0 ? "Total" : i === amountAt ? centsToPlain(totalCents) : ""));
  return { header, rows: rows.length ? [...rows, total] : rows, amountColumns: [amountAt], totalCents, count: rows.length, needAttention };
}
