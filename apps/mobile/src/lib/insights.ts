import { percentOf } from "./giving";
import { taxYearFor } from "./tax-year";

/**
 * The numbers behind "Your giving": only the donor's own gifts through Givezy, nothing estimated or invented.
 * Pure, so the website's tests can check them. Amounts stay in cents; dates are Johannesburg calendar days.
 */
export type InsightGift = { date: Date; cents: number; charitySlug: string; charityName: string; monthly: boolean; with18a: boolean };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type MonthTotal<G> = { label: string; short: string; cents: number; gifts: G[]; future: boolean };

/** The twelve months of a tax year (March to February), each with its total and gifts. Months after `today` are marked future. */
export function monthsOfTaxYear<G extends InsightGift>(gifts: G[], year: number, today: Date): MonthTotal<G>[] {
  const todayKey = today.getFullYear() * 12 + today.getMonth();
  return Array.from({ length: 12 }, (_, i) => {
    const month = (2 + i) % 12;
    const calYear = month >= 2 ? year - 1 : year;
    const inMonth = gifts.filter((g) => g.date.getFullYear() === calYear && g.date.getMonth() === month);
    return {
      label: `${MONTHS[month]} ${calYear}`,
      short: MONTHS[month].slice(0, 1),
      cents: inMonth.reduce((n, g) => n + g.cents, 0),
      gifts: [...inMonth].sort((a, b) => b.date.getTime() - a.date.getTime()),
      future: calYear * 12 + month > todayKey,
    };
  });
}

export type Share = { key: string; name: string; cents: number; percent: number };

/**
 * Totals per group, largest first, with everything past the first `keep` folded into "Other" so a ring never
 * needs more than `keep` colours. Percentages are whole numbers of the total (they may not add to exactly 100).
 */
export function shares<G extends InsightGift>(gifts: G[], group: (g: G) => { key: string; name: string }, keep = 3): Share[] {
  const total = gifts.reduce((n, g) => n + g.cents, 0);
  const m = new Map<string, { name: string; cents: number }>();
  for (const g of gifts) {
    const k = group(g);
    const cur = m.get(k.key) ?? { name: k.name, cents: 0 };
    cur.cents += g.cents;
    m.set(k.key, cur);
  }
  const sorted = [...m].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));
  const top = sorted.slice(0, keep);
  const rest = sorted.slice(keep);
  // Past `keep`, the rest share one quiet "Other" slice (named, when it is just one).
  const other = { key: "other", name: rest.length === 1 ? rest[0].name : `Other (${rest.length})`, cents: rest.reduce((n, r) => n + r.cents, 0) };
  const rows = rest.length ? [...top, other] : top;
  return rows.map((r) => ({ ...r, percent: percentOf(r.cents, total) }));
}

/** The most calendar months in a row that each had at least one gift. */
export function longestRun(dates: Date[]): number {
  const keys = [...new Set(dates.map((d) => d.getFullYear() * 12 + d.getMonth()))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  keys.forEach((k, i) => {
    run = i > 0 && k === keys[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

/** The single largest gift (the most recent one if two are equal), or null when there are none. */
export function biggestGift<G extends InsightGift>(gifts: G[]): G | null {
  return gifts.reduce<G | null>((best, g) => (!best || g.cents > best.cents || (g.cents === best.cents && g.date > best.date) ? g : best), null);
}

/** How the total splits: with or without an s18A receipt, and monthly or once-off. */
export function splits(gifts: InsightGift[]) {
  const sum = (f: (g: InsightGift) => boolean) => gifts.filter(f).reduce((n, g) => n + g.cents, 0);
  return { total: sum(() => true), with18a: sum((g) => g.with18a), without18a: sum((g) => !g.with18a), monthly: sum((g) => g.monthly), onceOff: sum((g) => !g.monthly) };
}

/** Gifts in one SARS tax year. */
export function inTaxYear<G extends InsightGift>(gifts: G[], year: number): G[] {
  return gifts.filter((g) => taxYearFor(g.date) === year);
}
