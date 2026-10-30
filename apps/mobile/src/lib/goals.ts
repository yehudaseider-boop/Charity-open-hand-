/**
 * Giving goals. A goal is either a share of income ("10% of what I earn") or a set amount
 * ("R12 000 a year"), per month or per tax year. It counts all the donor's giving, or only gifts
 * with certain labels (a "Work giving" goal counts gifts labelled "Work giving"). Kept on the phone
 * only. Pure (no React Native): the website's tests check it. Money is whole cents; percentages are
 * parts per million (10% = 100 000).
 */
import { LEGACY_KIND_LABELS } from "@shared/donations/labels";
import { taxYearFor, taxYearName } from "./tax-year";

export type GoalPeriod = "month" | "year";
/**
 * The SARS tax year, 1 March to end February. Goals saved by older versions with another kind of
 * year are read back as tax-year goals (nothing else about them changes).
 */
export type GoalYear = "tax";

export type Goal = {
  id: string;
  /** What the donor calls it: "Giving goal", "Family". */
  name: string;
  basis: "income" | "fixed";
  /** basis "income": the share of income, in ppm. */
  percentPpm: number | null;
  /** basis "fixed": the amount for each period, in cents. */
  fixedCents: number | null;
  period: GoalPeriod;
  year: GoalYear;
  /** Labels that count towards it; null = all the donor's giving. */
  counts: string[] | null;
};

export const MAX_GOALS = 3;
export const PPM = 1_000_000;

const okPpm = (v: unknown) => Number.isSafeInteger(v) && (v as number) > 0 && (v as number) < PPM;
const okCents = (v: unknown) => Number.isSafeInteger(v) && (v as number) > 0;

/** Goals read back from the phone: anything malformed is dropped, at most three kept. */
export function cleanGoals(raw: unknown): Goal[] {
  if (!Array.isArray(raw)) return [];
  const out: Goal[] = [];
  for (const g of raw) {
    if (!g || typeof g !== "object") continue;
    const o = g as Record<string, unknown>;
    const basis = o.basis === "income" || o.basis === "fixed" ? o.basis : null;
    const period = o.period === "month" || o.period === "year" ? o.period : null;
    const year: GoalYear = "tax";
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 40) : "";
    if (!basis || !period || !name || typeof o.id !== "string") continue;
    if (basis === "income" && !okPpm(o.percentPpm)) continue;
    if (basis === "fixed" && !okCents(o.fixedCents)) continue;
    const counts = Array.isArray(o.counts)
      ? o.counts.filter((c): c is string => typeof c === "string" && c.trim() !== "").map((c) => c.trim().slice(0, 40))
      : null;
    out.push({
      id: o.id,
      name,
      basis,
      percentPpm: basis === "income" ? (o.percentPpm as number) : null,
      fixedCents: basis === "fixed" ? (o.fixedCents as number) : null,
      period,
      year,
      counts: counts && counts.length ? counts : null,
    });
    if (out.length === MAX_GOALS) break;
  }
  return out;
}

/**
 * Targets saved by a much older version (a first and an optional second amount, per month or per
 * year) as goals, so nobody's numbers are lost. They keep the names and labels the donor's gifts
 * were marked with back then, and now count the tax year; the donor can rename or remove them.
 */
export function goalsFromOldTarget(t: { period: GoalPeriod; maaserCents: number; chomeshCents: number | null } | null): Goal[] {
  if (!t) return [];
  const first = LEGACY_KIND_LABELS.maaser;
  const second = LEGACY_KIND_LABELS.chomesh;
  const goals: Goal[] = [{ id: "earlier-1", name: first, basis: "fixed", percentPpm: null, fixedCents: t.maaserCents, period: t.period, year: "tax", counts: [first] }];
  if (t.chomeshCents) goals.push({ id: "earlier-2", name: second, basis: "fixed", percentPpm: null, fixedCents: t.chomeshCents, period: t.period, year: "tax", counts: [second] });
  return goals;
}

const sameLabel = (a: string | null | undefined, b: string) => Boolean(a && a.trim().toLowerCase() === b.trim().toLowerCase());

/** Does a gift with this label count towards the goal? */
export function counts(goal: Pick<Goal, "counts">, label: string | null | undefined): boolean {
  return goal.counts === null || goal.counts.some((c) => sameLabel(label, c));
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dmy = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type GoalWindow = { start: Date; end: Date; label: string; endLabel: string; monthsLeft: number };

/** The goal's current period, around `today` (a Johannesburg calendar day). */
export function goalWindow(goal: Pick<Goal, "period" | "year">, today: Date): GoalWindow {
  if (goal.period === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { start, end, label: `${MONTHS[today.getMonth()]} ${today.getFullYear()}`, endLabel: dmy(end), monthsLeft: 1 };
  }
  const ty = taxYearFor(today);
  const start = new Date(ty - 1, 2, 1);
  const end = new Date(ty, 2, 0);
  const monthsLeft = Math.max(1, (end.getFullYear() - today.getFullYear()) * 12 + (end.getMonth() - today.getMonth()) + 1);
  return { start, end, label: `${taxYearName(ty)} tax year`, endLabel: dmy(end), monthsLeft };
}

type Row = { date: Date; cents: number; label: string | null };
type Income = { date: string; cents: number };

export type GoalProgress = {
  window: GoalWindow;
  /** Null when the goal is a share of income and no income is logged for the period yet. */
  targetCents: number | null;
  incomeCents: number;
  givenCents: number;
  leftCents: number;
  /** For a yearly goal: about how much a month to reach it, rounded up to whole Rand. */
  perMonthCents: number;
};

/** How far along the goal is: target, what counts so far, and what is left. */
export function goalProgress(goal: Goal, rows: Row[], income: Income[], today: Date): GoalProgress {
  const w = goalWindow(goal, today);
  const stop = new Date(w.end.getFullYear(), w.end.getMonth(), w.end.getDate() + 1);
  const givenCents = rows.filter((r) => r.date >= w.start && r.date < stop && counts(goal, r.label)).reduce((t, r) => t + r.cents, 0);
  const from = iso(w.start);
  const to = iso(w.end);
  const incomeCents = income.filter((e) => e.date >= from && e.date <= to).reduce((t, e) => t + e.cents, 0);
  const targetCents =
    goal.basis === "fixed" ? goal.fixedCents! : incomeCents > 0 ? Math.round((incomeCents * goal.percentPpm!) / PPM) : null;
  const leftCents = targetCents === null ? 0 : Math.max(0, targetCents - givenCents);
  const perMonthCents = goal.period === "year" && leftCents > 0 ? Math.ceil(leftCents / w.monthsLeft / 100) * 100 : 0;
  return { window: w, targetCents, incomeCents, givenCents, leftCents, perMonthCents };
}

/** "10%" from ppm, with up to two decimals ("12.5%"). */
export function ppmToPercentText(ppm: number): string {
  const whole = Math.floor(ppm / 10_000);
  const frac = ppm % 10_000;
  if (!frac) return `${whole}%`;
  return `${whole}.${String(frac).padStart(4, "0").replace(/0+$/, "")}%`;
}

/** Labels the donor has used, most used first (for one-tap choices). Case-insensitive, first spelling kept. */
export function knownLabels(rows: { label: string | null }[], extra: readonly string[] = []): string[] {
  const seen = new Map<string, { label: string; n: number }>();
  for (const l of extra) seen.set(l.toLowerCase(), { label: l, n: 0 });
  for (const r of rows) {
    if (!r.label) continue;
    const k = r.label.trim().toLowerCase();
    const s = seen.get(k) ?? { label: r.label.trim(), n: 0 };
    s.n++;
    seen.set(k, s);
  }
  return [...seen.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).map((s) => s.label);
}

export type MonthTile = {
  /** year * 12 + month (the Johannesburg calendar month). */
  key: number;
  label: string;
  given: boolean;
  future: boolean;
  current: boolean;
  /** How full the tile is, 0 to 1000: what was given that month against the month's share of the goal. */
  fill: number;
};

/** A month with a gift never looks empty, however small the gift. */
const MIN_FILL = 150;

/**
 * One tile per month of the goal's year (a monthly goal shows the tax year): given when a gift
 * that counts towards the goal was made that month, future for months still to come.
 *
 * Each given month fills by its share of the goal: a yearly goal is split evenly over its months
 * (R12 000 over 12 months is R1 000 a month), a monthly goal is its own amount each month. A month
 * at or above its share is full. With no target to measure against (a share of income with no
 * income logged, or a monthly share of income, whose target changes each month), a given month is full.
 */
export function monthTiles(goal: Goal, rows: Row[], today: Date, targetCents: number | null = null): MonthTile[] {
  const w = goalWindow(goal.period === "year" ? goal : { period: "year", year: "tax" }, today);
  const key = (d: Date) => d.getFullYear() * 12 + d.getMonth();
  const byMonth = new Map<number, number>();
  for (const r of rows) if (counts(goal, r.label)) byMonth.set(key(r.date), (byMonth.get(key(r.date)) ?? 0) + r.cents);
  const now = key(today);
  const first = key(w.start);
  const last = key(w.end);
  const months = last - first + 1;
  // The month's share, kept as a fraction (target / per) so no cents are rounded away.
  const measurable = targetCents !== null && targetCents > 0 && !(goal.period === "month" && goal.basis === "income");
  const per = goal.period === "month" ? 1 : months;
  const tiles: MonthTile[] = [];
  for (let m = first; m <= last; m++) {
    const cents = byMonth.get(m) ?? 0;
    const given = byMonth.has(m);
    const fill = !given ? 0 : !measurable ? 1000 : Math.max(MIN_FILL, Math.min(1000, Math.floor((cents * per * 1000) / targetCents!)));
    tiles.push({ key: m, label: MONTHS[m % 12].slice(0, 3), given, future: m > now, current: m === now, fill });
  }
  return tiles;
}
