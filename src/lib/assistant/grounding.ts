/**
 * Givy never invents a figure (27/11/2026, Yehuda chose an accuracy check). Every Rand amount Givy writes must come
 * from what it looked up for that answer (or what the person typed): an amount found in the lookups, or the sum or
 * difference of two of them (a "R2 500 more than last month" is fine). Anything else is reported, and the answer ends
 * with a plain note asking the person to check that figure on the dashboard. No AI involved: plain matching.
 *
 * Pure: the route and the tests share it.
 */

/** Rand amounts as Givezy writes them: "R1 250", "R34.57", "R1,250" or "R 1250" (cents, as whole numbers). */
const AMOUNT = /R\s?(\d{1,3}(?:[  ,]\d{3})+|\d+)(?:\.(\d{2}))?(?![\d.,]*\d)/g;

export function amountsIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(AMOUNT)) {
    const rands = Number(m[1].replace(/[  ,]/g, ""));
    if (!Number.isSafeInteger(rands)) continue;
    out.push(rands * 100 + (m[2] ? Number(m[2]) : 0));
  }
  return out;
}

/** Lookup results hold cents as numbers too ("total_cents": 921000): those count, as do Rand amounts written out. */
function knownFrom(sources: readonly string[]): Set<number> {
  const known = new Set<number>();
  for (const s of sources) {
    for (const c of amountsIn(s)) known.add(c);
    for (const m of s.matchAll(/"[a-z0-9_]*cents"\s*:\s*(\d+)/g)) known.add(Number(m[1]));
  }
  return known;
}

/**
 * The amounts in Givy's answer that match nothing it looked up (nor the person's own words), in cents, each once.
 * An amount counts as matched when it is one of the known amounts, or the sum or difference of two of them.
 */
export function unmatchedAmounts(answer: string, sources: readonly string[]): number[] {
  const known = [...knownFrom(sources)];
  const set = new Set(known);
  // Sums and differences of two known amounts (at most a few hundred known amounts per answer, so this stays small).
  if (known.length <= 400) {
    for (let i = 0; i < known.length; i++) {
      for (let j = i; j < known.length; j++) {
        set.add(known[i] + known[j]);
        set.add(Math.abs(known[i] - known[j]));
      }
    }
  }
  const out: number[] = [];
  for (const c of amountsIn(answer)) if (!set.has(c) && !out.includes(c)) out.push(c);
  return out;
}

/** The note added at the end of an answer with an unmatched figure (never the figure invented over). */
export function unmatchedNote(cents: readonly number[], format: (c: number) => string): string {
  if (cents.length === 0) return "";
  const list = cents.slice(0, 3).map(format).join(", ");
  return cents.length === 1
    ? `\n\nI couldn't match ${list} to your records. Please check that figure on the dashboard before you rely on it.`
    : `\n\nI couldn't match ${list} to your records. Please check those figures on the dashboard before you rely on them.`;
}
