import { taxYearFor } from "./tax-year";

type Dated = { date: Date; cents: number };

/** Sum of amounts in a given SARS tax year. */
export function totalInTaxYear(rows: Dated[], year: number): number {
  return rows.filter((r) => taxYearFor(r.date) === year).reduce((s, r) => s + r.cents, 0);
}

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Group rows by calendar month, newest first: [{ label: "October 2026", rows }]. */
export function groupByMonth<T extends { date: Date }>(rows: T[]): { label: string; rows: T[] }[] {
  const sorted = [...rows].sort((a, b) => b.date.getTime() - a.date.getTime());
  const groups: { label: string; rows: T[] }[] = [];
  for (const r of sorted) {
    const label = `${months[r.date.getMonth()]} ${r.date.getFullYear()}`;
    const last = groups.at(-1);
    if (last?.label === label) last.rows.push(r);
    else groups.push({ label, rows: [r] });
  }
  return groups;
}

/** Maaser target from income and a percentage in ppm (10% = 100000), rounded to the nearest cent. */
export function maaserTargetCents(incomeCents: number, percentPpm: number): number {
  return Math.round((incomeCents * percentPpm) / 1_000_000);
}
