/**
 * The words and links on the Find a charity page (11/11/2026). Pure, so they are tested on their own and the page
 * says the same thing for every search, cause and empty list.
 */

/** "1 charity" or "6 charities", plus what was searched for and in which cause. */
export function resultsLine(count: number, q: string, cause: string | null): string {
  const n = `${count} ${count === 1 ? "charity" : "charities"}`;
  return `${n}${q ? ` for “${q}”` : ""}${cause ? ` in ${cause}` : ""}`;
}

/** The link for a cause chip (null is "All"), keeping what was typed in the search. */
export function causeHref(slug: string | null, q: string): string {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (slug) p.set("category", slug);
  const qs = p.toString();
  return qs ? `/charities?${qs}` : "/charities";
}

/**
 * What the page says when the list is empty. A search or cause that finds nothing gets a way out: clear the search
 * (keeping the cause), or see every charity. With no search and no cause, the list is simply empty for now.
 */
export function emptyState(q: string, cause: { slug: string; name: string } | null): {
  title: string;
  body: string;
  actions: { label: string; href: string }[];
} {
  if (!q && !cause) {
    return { title: "No charities yet", body: "The first charities are joining now. Check back soon.", actions: [] };
  }
  const what = q && cause ? `“${q}” in ${cause.name}` : q ? `“${q}”` : cause!.name;
  const actions: { label: string; href: string }[] = [];
  // With no cause, clearing the search already shows every charity, so there is one button, not two to one place.
  if (q) actions.push({ label: "Clear the search", href: causeHref(cause?.slug ?? null, "") });
  if (cause) actions.push({ label: "See all charities", href: "/charities" });
  return { title: "No charities match that yet", body: `Nothing for ${what}. Try another word or a different cause.`, actions };
}

/** The soft colour behind a charity with no cover photo, in turn, so a row of them isn't one flat block. */
export const COVER_TONES = ["bg-honey-soft", "bg-peach", "bg-brand-soft"] as const;
export function coverTone(i: number): (typeof COVER_TONES)[number] {
  return COVER_TONES[((i % COVER_TONES.length) + COVER_TONES.length) % COVER_TONES.length];
}
