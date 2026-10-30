/**
 * The charity's own impact line, or null when there isn't a real one. A line still holding a bracketed
 * placeholder ("[Impact line from the charity, ...]", as in the sample data) is never shown to a donor:
 * the block that would hold it is hidden instead. Never invent a line to fill the gap.
 */
export function realImpactLine(line: string | null | undefined): string | null {
  const t = line?.trim();
  if (!t) return null;
  if (/\[[^\]]*\]/.test(t)) return null;
  return t;
}
