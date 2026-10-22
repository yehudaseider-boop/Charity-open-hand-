/**
 * Cause categories (Food and welfare, Education, …): what donors filter charities by, on the website and in
 * the app, and what each charity ticks on its profile. Givezy keeps the list in Admin, Causes.
 */

/** The general list agreed for launch (go-live checklist, 16/10/2026), in this order. */
export const SUGGESTED_CAUSES = [
  "Food and welfare",
  "Children and youth",
  "Education",
  "Health",
  "Animals",
  "Faith communities",
  "Elderly care",
  "Disability",
  "Housing and shelter",
  "Environment",
  "Disaster relief",
  "Arts and culture",
] as const;

/** The web address part for a cause ("Food and welfare" → "food-and-welfare"). */
export function causeSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** A cause name as typed: trimmed, one space between words, 2 to 40 characters, with at least one letter. */
export function checkCauseName(raw: string): { ok: true; name: string; slug: string } | { ok: false; code: "empty" | "long" | "letters" } {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < 2) return { ok: false, code: "empty" };
  if (name.length > 40) return { ok: false, code: "long" };
  const slug = causeSlug(name);
  if (!slug || !/[a-z]/.test(slug)) return { ok: false, code: "letters" };
  return { ok: true, name, slug };
}

/** What each outcome says on the page (only these fixed texts are shown, never text from the address). */
export const causeMessages: Record<string, string> = {
  added: "Added. It shows on the website and in the app straight away.",
  added_list: "Added the causes that were missing from the launch list.",
  list_there: "Every cause on the launch list is already here.",
  renamed: "Renamed. Its web address stays the same, so shared links keep working.",
  removed: "Removed. You can add it again any time.",
  empty: "Type a name for the cause. Nothing was changed.",
  long: "Keep it to 40 characters, so it fits on a phone. Nothing was changed.",
  letters: "Use letters in the name. Nothing was changed.",
  duplicate: "That cause is already on the list. Nothing was changed.",
  missing: "That cause wasn't found. Nothing was changed.",
  in_use: "Charities have chosen this cause, so it stays (they would lose it from their page). Rename it instead.",
};
