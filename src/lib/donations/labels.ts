/**
 * A donor's own label for a gift ("Work giving", "Family", "Maaser"): optional and private to them.
 * Replaces the fixed maaser / chomesh / tzedaka choice; old choices read as labels. Dependency-free:
 * the phone app uses this file too.
 */
export const LABEL_MAX = 40;

/** What the old fixed choices read as now. */
export const LEGACY_KIND_LABELS: Record<string, string> = { maaser: "Maaser", chomesh: "Chomesh", tzedaka: "Tzedaka" };

/** Ready-made labels for people who switch on "Jewish calendar and maaser". */
export const JEWISH_LABELS = ["Maaser", "Chomesh", "Tzedaka"] as const;

/** Trimmed, single-spaced, no control characters, at most 40 characters; null when empty. */
export function cleanLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, LABEL_MAX).trim();
  return s || null;
}

/** A stored row's label: the label itself, or what an old fixed choice reads as. */
export function labelOf(row: { label?: string | null; kind?: string | null } | null | undefined): string | null {
  if (!row) return null;
  return cleanLabel(row.label) ?? (row.kind ? (LEGACY_KIND_LABELS[row.kind] ?? null) : null);
}

/** Labels match whatever the case ("maaser" and "Maaser" are the same label). */
export function sameLabel(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}
