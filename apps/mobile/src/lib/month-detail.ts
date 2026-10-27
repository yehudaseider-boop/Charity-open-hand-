/**
 * What the Progress panel says about one month of the main goal, when its tile is tapped.
 * Plain facts only, worked out from the donor's own gifts: what was given, against that month's
 * share of the goal, and the gifts themselves. Never a comparison with another month, never
 * "fell short", "missed" or "only" (decided 27/10/2026). Pure, so the website's tests check it.
 */
import { formatRand } from "@shared/money";
import { counts, goalWindow, type Goal, type GoalProgress } from "./goals";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const dmy = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

/** A gift through Givezy (charityName) or giving logged elsewhere (recipient). */
export type MonthRow = { id: string; date: Date; cents: number; label: string | null; charityName?: string; recipient?: string };

export type MonthDetail = {
  /** year * 12 + month, the same key as the tile. */
  key: number;
  /** "June 2026" */
  title: string;
  when: "past" | "current" | "future";
  givenCents: number;
  /** The month's share of the goal; null when there is nothing to measure against. */
  shareCents: number | null;
  /** The gifts that month that count towards the goal, newest first. */
  gifts: { id: string; date: Date; cents: number; label: string | null; name: string; elsewhere: boolean }[];
  /** The one plain line under the amount (or null). */
  line: string | null;
};

const key = (d: Date) => d.getFullYear() * 12 + d.getMonth();

/** The month's share: a yearly goal split evenly over its months, a monthly goal its own amount. */
export function monthShare(goal: Goal, targetCents: number | null, months: number): number | null {
  if (targetCents === null || targetCents <= 0) return null;
  // A monthly share of income changes every month with the income logged: no single figure to show.
  if (goal.period === "month" && goal.basis === "income") return null;
  return goal.period === "month" ? targetCents : Math.round(targetCents / months);
}

export function monthDetail(goal: Goal, rows: MonthRow[], today: Date, monthKey: number, progress: GoalProgress): MonthDetail {
  const w = goalWindow(goal.period === "year" ? goal : { period: "year", year: "tax" }, today);
  const months = key(w.end) - key(w.start) + 1;
  const month = monthKey % 12;
  const name = MONTHS[month];
  const title = `${name} ${Math.floor(monthKey / 12)}`;
  const now = key(today);
  const when = monthKey < now ? "past" : monthKey === now ? "current" : "future";
  const inMonth = rows.filter((r) => key(r.date) === monthKey && counts(goal, r.label));
  const givenCents = inMonth.reduce((n, r) => n + r.cents, 0);
  const shareCents = monthShare(goal, progress.targetCents, months);
  const gifts = [...inMonth]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((r) => ({ id: r.id, date: r.date, cents: r.cents, label: r.label, name: r.charityName ?? r.recipient ?? "", elsewhere: r.charityName === undefined }));

  const noShare = goal.basis === "income" ? "Log your income to see this month's share." : null;
  let line: string | null;
  if (when === "future") {
    if (progress.targetCents === null) line = goal.basis === "income" ? "Log your income to see the plan." : null;
    else if (progress.leftCents === 0) line = "Goal reached. Anything more is extra.";
    else if (goal.period === "month") line = shareCents === null ? null : `Your goal is ${formatRand(shareCents)} a month.`;
    else line = `About ${formatRand(progress.perMonthCents)} a month gets you to ${formatRand(progress.targetCents)} by ${dmy(w.end)}.`;
  } else if (shareCents === null) {
    line = noShare;
  } else if (when === "current") {
    line = givenCents < shareCents ? `${formatRand(shareCents - givenCents)} to go this month.` : "This month's share reached.";
  } else if (givenCents === 0) {
    line = `No gifts in ${name}.`;
  } else if (givenCents < shareCents) {
    line = `${formatRand(shareCents - givenCents)} under ${name}'s share.`;
  } else if (givenCents > shareCents) {
    line = `${formatRand(givenCents - shareCents)} over ${name}'s share.`;
  } else {
    line = `${name}'s share reached.`;
  }
  return { key: monthKey, title, when, givenCents, shareCents, gifts, line };
}
