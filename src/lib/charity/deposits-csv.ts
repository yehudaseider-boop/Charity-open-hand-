import { centsToPlain, toCsv } from "@/lib/csv";
import { donationReference } from "@/lib/donations/reference";
import { formatDate } from "@/lib/dates";
import { kindWord } from "./deposits";
import type { DepositSummary } from "./deposit-queries";

const HEADER = ["Deposit date", "Deposit total (R)", "Donor", "What", "Reference", "Gift (R)", "Fee (R)", "Reached the bank (R)", "Adds up"];
/** The amount columns (written as numbers in Excel). */
export const DEPOSIT_AMOUNT_COLUMNS = [1, 5, 6, 7];

/** Deposits line by line: one row per line, the deposit's date and total on each. */
export function depositTable(deposits: DepositSummary[]): { header: string[]; rows: (string | number | null)[][] } {
  const rows: (string | number | null)[][] = [];
  for (const d of deposits) {
    const date = formatDate(`${d.paidOutOn}T12:00:00+02:00`);
    for (const r of d.deposit.rows) {
      rows.push([date, centsToPlain(d.amountCents), r.donorName, kindWord(r.kind), r.donationId ? donationReference(r.donationId) : "", r.giftCents === null ? "" : centsToPlain(r.giftCents), centsToPlain(r.feeCents), centsToPlain(r.netCents), r.problem ? "No" : "Yes"]);
    }
  }
  return { header: HEADER, rows };
}

export function depositsCsv(deposits: DepositSummary[]): string {
  const t = depositTable(deposits);
  return toCsv(t.header, t.rows);
}

/**
 * For Xero (Yehuda, 21/10/2026): Xero's bank statement import layout, meant for a clearing account (for
 * example "Givezy donations clearing"). Each paid deposit is three or more lines: the donations in, card
 * fees out, and the deposit out to the bank. They add up to nothing when the deposit adds up, so the
 * clearing account sits at zero and the bank line in Xero matches "Deposit to your bank". The payment
 * provider's own figures are used (gift plus fee), as they are what moved.
 */
export function xeroStatementCsv(deposits: DepositSummary[]): string {
  const rows: string[][] = [];
  for (const d of deposits) {
    if (d.status !== "paid") continue;
    const date = formatDate(`${d.paidOutOn}T12:00:00+02:00`);
    const ref = `GZ-DEP-${d.id.slice(0, 8).toUpperCase()}`;
    const sum = (kinds: string[]) => d.deposit.rows.filter((r) => kinds.includes(r.kind)).reduce((t, r) => t + r.netCents + r.feeCents, 0);
    const count = (kinds: string[]) => d.deposit.rows.filter((r) => kinds.includes(r.kind)).length;
    const gifts = sum(["payment"]);
    const back = sum(["refund", "chargeback"]);
    const other = sum(["other"]);
    const fees = d.deposit.rows.reduce((t, r) => t + r.feeCents, 0);
    if (gifts) rows.push([date, centsToPlain(gifts), "Givezy donors", `Donations in the deposit of ${date} (${count(["payment"])} ${count(["payment"]) === 1 ? "gift" : "gifts"})`, ref]);
    if (back) rows.push([date, centsToPlain(back), "Givezy donors", `Refunds and chargebacks in the deposit of ${date}`, ref]);
    if (other) rows.push([date, centsToPlain(other), "Payment provider", `Other lines in the deposit of ${date}: ask Givezy what they are`, ref]);
    if (fees) rows.push([date, centsToPlain(-fees), "Payment provider", `Card fees in the deposit of ${date}`, ref]);
    rows.push([date, centsToPlain(-d.amountCents), "Your bank account", `Deposit to your bank on ${date}`, ref]);
  }
  return toCsv(["*Date", "*Amount", "Payee", "Description", "Reference"], rows);
}
