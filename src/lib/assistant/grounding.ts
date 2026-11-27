/**
 * Givy never invents a figure (27/11/2026, Yehuda chose an accuracy check). Every Rand amount Givy writes must come
 * from what it looked up for that answer (or what the person typed): an amount found in the lookups, or the sum or
 * difference of two of them (a "R2 500 more than last month" is fine). Anything else is reported, and the answer ends
 * with a plain note asking the person to check that figure on the dashboard. No AI involved: plain matching.
 *
 * Pure: the route and the tests share it.
 */

/** Thousands separators people and models use: a space, a no-break space, a narrow no-break space, a thin space, a comma. */
const SEP = "[ \u00a0\u202f\u2009,]";
/** A whole number of Rand, with or without thousands separators. */
const WHOLE = `\\d{1,3}(?:${SEP}\\d{3})+|\\d+`;
/**
 * Rand amounts as Givezy writes them: "R1 250", "R34.57", "R1,250", "R 1250", "R1 250,50" (a comma before two digits is
 * cents). Never inside a word or code: "ITR12" is not R12 (review 27/11/2026).
 */
const AMOUNT = new RegExp(`(?<![A-Za-z0-9])R\\s?(${WHOLE})(?:[.,](\\d{1,2})(?!\\d))?(?![\\d]|[.,]\\d)`, "g");
/** "R2 million", "R1.2m", "R12k", "R3,5 million": checked at their full size. */
const SCALED = /(?<![A-Za-z0-9])R\s?(\d+)(?:[.,](\d{1,3}))?\s?(million|mil|m|bn|billion|k|thousand)\b/gi;
/** "1 250 rand", "300 rands". */
const WORDED = new RegExp(`(?<![A-Za-z0-9.,])(${WHOLE})(?:[.,](\\d{2}))?\\s?rands?\\b`, "gi");

const SCALE: Record<string, number> = { k: 1_000, thousand: 1_000, m: 1_000_000, mil: 1_000_000, million: 1_000_000, bn: 1_000_000_000, billion: 1_000_000_000 };

/** Whole Rand plus cents (1 or 2 digits: ".5" is 50 cents), as cents; null when too big to hold. */
function toCents(whole: string, fraction: string | undefined): number | null {
  const rands = Number(whole.replace(/[ \u00a0\u202f\u2009,]/g, ""));
  const cents = fraction ? Number(fraction.padEnd(2, "0")) : 0;
  const total = rands * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}

export function amountsIn(text: string): number[] {
  const out: number[] = [];
  // Scaled amounts first, then taken out, so "R2 million" is never also read as R2.
  let rest = text.replace(SCALED, (_m, whole: string, fraction: string | undefined, unit: string) => {
    const scale = SCALE[unit.toLowerCase()];
    const digits = fraction ?? "";
    // Integer sums only: 1.2 million is 12 × 100 000, in cents.
    const value = Number(whole + digits) * (scale / 10 ** digits.length) * 100;
    if (Number.isSafeInteger(value)) out.push(value);
    return " ";
  });
  rest = rest.replace(AMOUNT, (_m, whole: string, fraction: string | undefined) => {
    const c = toCents(whole, fraction);
    if (c !== null) out.push(c);
    return " ";
  });
  for (const m of rest.matchAll(WORDED)) {
    const c = toCents(m[1], m[2]);
    if (c !== null) out.push(c);
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

/**
 * What the chat so far may vouch for (review 27/11/2026): everything the person typed, and earlier answers minus any
 * figure that answer's own note said couldn't be matched (otherwise a flagged figure would pass unnoticed next time).
 */
export function trustedChat(messages: readonly { role: string; content: string }[]): string[] {
  return messages.map((m) => {
    if (m.role !== "assistant") return m.content;
    const at = m.content.indexOf("I couldn't match ");
    if (at < 0) return m.content;
    const flagged = new Set(amountsIn(m.content.slice(at)));
    const body = m.content.slice(0, at);
    // Each flagged figure is taken out of the earlier answer; the rest of it still counts.
    return body.replace(AMOUNT, (whole) => (amountsIn(whole).some((c) => flagged.has(c)) ? " " : whole));
  });
}

/** The note added at the end of an answer with an unmatched figure (never the figure invented over). */
export function unmatchedNote(cents: readonly number[], format: (c: number) => string): string {
  if (cents.length === 0) return "";
  const list = cents.slice(0, 3).map(format).join(", ");
  return cents.length === 1
    ? `\n\nI couldn't match ${list} to your records. Please check that figure on the dashboard before you rely on it.`
    : `\n\nI couldn't match ${list} to your records. Please check those figures on the dashboard before you rely on them.`;
}
