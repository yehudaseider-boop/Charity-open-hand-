import { centsToPlain, toCsv } from "@/lib/csv";
import { donationReference } from "@/lib/donations/reference";
import { formatDate } from "@/lib/dates";
import { kindWord } from "./deposits";
import type { DepositSummary } from "./deposit-queries";

const HEADER = ["Deposit date", "Deposit total (R)", "Donor", "What", "Reference", "Gift (R)", "Fee (R)", "Reached the bank (R)", "Adds up"];

/** Deposits line by line for a spreadsheet: one row per line, the deposit's date and total on each. */
export function depositsCsv(deposits: DepositSummary[]): string {
  const rows: (string | number | null)[][] = [];
  for (const d of deposits) {
    const date = formatDate(`${d.paidOutOn}T12:00:00+02:00`);
    for (const r of d.deposit.rows) {
      rows.push([date, centsToPlain(d.amountCents), r.donorName, kindWord(r.kind), r.donationId ? donationReference(r.donationId) : "", r.giftCents === null ? "" : centsToPlain(r.giftCents), centsToPlain(r.feeCents), centsToPlain(r.netCents), r.problem ? "No" : "Yes"]);
    }
  }
  return toCsv(HEADER, rows);
}
