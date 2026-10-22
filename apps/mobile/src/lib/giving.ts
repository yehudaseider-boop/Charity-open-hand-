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

/** Whole-number percent of a part in a total, rounded; 0 when the total is 0. */
export function percentOf(partCents: number, totalCents: number): number {
  return totalCents > 0 ? Math.round((partCents * 100) / totalCents) : 0;
}

/** The SARS tax years the donor gave in, newest first, always with the current one at the top. */
export function taxYearsGiven(rows: { date: Date }[], current: number): number[] {
  const years = new Set(rows.map((r) => taxYearFor(r.date)).filter((y) => y <= current));
  years.add(current);
  return [...years].sort((a, b) => b - a);
}

/** Totals per charity, largest first. */
export function byCharity<T extends { charityName: string; cents: number }>(rows: T[]): { name: string; cents: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.charityName, (m.get(r.charityName) ?? 0) + r.cents);
  return [...m].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents);
}
