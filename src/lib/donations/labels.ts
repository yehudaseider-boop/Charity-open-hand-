/**
 * A donor's own label for a gift ("Work giving", "Family"): optional and private to them.
 * Replaces an old fixed choice of giving kind; gifts stored with one of those still read as a label,
 * so nothing anyone saved is lost. Dependency-free: the phone app uses this file too.
 */
export const LABEL_MAX = 40;

/**
 * What the old fixed choices, still stored on older gifts, read as now: the stored word in sentence
 * case. Givezy never offers these; they are only read back. Any other stored kind reads as no label.
 */
export const LEGACY_KIND_LABELS: Record<string, string> = { maaser: "Maaser", chomesh: "Chomesh", tzedaka: "Tzedaka" };

/** Trimmed, single-spaced, no control characters, at most 40 characters; null when empty. */
export function cleanLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, LABEL_MAX).trim();
  return s || null;
}

/** A stored row's label: the label itself, or what an old fixed choice reads as. */
export function labelOf(row: { label?: string | null; kind?: string | null } | null | undefined): string | null {
  if (!row) return null;
  return cleanLabel(row.label) ?? (row.kind && Object.hasOwn(LEGACY_KIND_LABELS, row.kind) ? LEGACY_KIND_LABELS[row.kind] : null);
}

/** Labels match whatever the case ("family" and "Family" are the same label). */
export function sameLabel(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}
