/**
 * A donor's own label for a gift ("Work giving", "Family"): optional and private to them.
 * Replaces an old fixed choice of giving kind. Gifts stored with one of those kinds keep it in the database,
 * but it is never shown (02/11/2026, Yehuda: no religious wording anywhere). Dependency-free: the phone app uses this file too.
 */
export const LABEL_MAX = 40;

/** Trimmed, single-spaced, no control characters, at most 40 characters; null when empty. */
export function cleanLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, LABEL_MAX).trim();
  return s || null;
}

/** A stored row's label: the donor's own label, or none. An old stored kind reads as no label. */
export function labelOf(row: { label?: string | null; kind?: string | null } | null | undefined): string | null {
  if (!row) return null;
  return cleanLabel(row.label);
}

/** Labels match whatever the case ("family" and "Family" are the same label). */
export function sameLabel(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}
