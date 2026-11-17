import { GIFT_SOURCES, isGiftSource } from "@/lib/donations/source";

/** Small, pure helpers for the dashboard's Overview page. */

export type SourceCount = { key: string; label: string; count: number; percent: number };

/**
 * Where paid gifts came from, most first. A gift with no source (older than 21/10/2026) is counted as
 * "Not known" so the list always adds up to every gift. Percentages are whole numbers that add up to 100.
 */
export function giftSourceCounts(rows: { came_from: string | null }[]): SourceCount[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = isGiftSource(r.came_from) ? r.came_from : "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()]
    .map(([key, count]) => ({
      key,
      label: key === "unknown" ? "Not known" : GIFT_SOURCES[key as keyof typeof GIFT_SOURCES],
      count,
      percent: 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const percents = wholePercents(sorted.map((r) => r.count));
  return sorted.map((r, i) => ({ ...r, percent: percents[i] }));
}

/**
 * Whole-number percentages of the total that always add up to exactly 100 (largest remainder): each share is
 * rounded down, then the points left over go to the shares that lost the most, earliest first on a tie.
 * So the list never shows 101% or 99% in all (17/11/2026). Integer arithmetic only; all zeros with no total.
 */
export function wholePercents(counts: number[]): number[] {
  const total = counts.reduce((t, c) => t + c, 0);
  if (total <= 0) return counts.map(() => 0);
  const floors = counts.map((c) => Math.floor((c * 100) / total));
  let left = 100 - floors.reduce((t, f) => t + f, 0);
  const order = counts.map((c, i) => ({ i, rest: (c * 100) % total })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

/**
 * How this period compares with the one before, as a whole percentage. Null when there is nothing before
 * to compare with (a percentage of zero means nothing), so the page shows no change rather than an invented one.
 */
export function changeSince(current: number, before: number): { percent: number; up: boolean } | null {
  if (!(before > 0)) return null;
  const percent = Math.round(((current - before) / before) * 100);
  // The direction comes from the amounts, not the rounded percentage, so a small fall never shows as a rise.
  return { percent: Math.abs(percent), up: current >= before };
}

/** The months from `startIso` (yyyy-mm-dd, the first day of the tax year) onwards, for the chart's "Tax year" view. */
export function monthsFrom<T extends { month: string }>(months: T[], startIso: string): T[] {
  return months.filter((m) => m.month >= startIso.slice(0, 7));
}

/**
 * The chart's y-axis: four equal steps of a round size (1, 2, 2.5 or 5 times a power of ten, in Rand) up to
 * just above the highest month, so every label is a round number and the line fills the chart whatever the
 * charity's size. For example R300 gives R0, R100, R200, R300, R400.
 */
export function chartScale(maxCents: number): { top: number; ticks: number[] } {
  const quarter = Math.max(100, maxCents / 100) / 4; // never below R100, so small months still get whole-Rand labels
  const magnitude = 10 ** Math.floor(Math.log10(quarter));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= quarter) ?? 10 * magnitude;
  const stepCents = Math.round(step * 100);
  return { top: stepCents * 4, ticks: [0, 1, 2, 3, 4].map((i) => stepCents * i) };
}
