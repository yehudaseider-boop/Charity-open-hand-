/**
 * Charity search, the same on the website and in the app (21/11/2026): capitals and accents don't matter either way
 * ("Cafe" finds "Café", "café" finds "Cafe"), and the typed words are found in order with anything between them
 * ("save a life" finds "Save-a-Life", "boys girls" finds "Boys & Girls").
 *
 * plainSearchText folds text the way the database's public.plain_search_text does (lower(), then unaccent), which
 * the website's search column (charities.search_text, migration 20261121000001) is built with. Shared with the app:
 * no imports.
 */

/** Letters unaccent spells out rather than just dropping a mark from (its rules file). */
const SPELLED_OUT: Record<string, string> = { "ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "ð": "d", "đ": "d", "þ": "th", "ı": "i", "ł": "l" };

/** Lower case without accents: "Café" is "cafe", "Straße" is "strasse". Other scripts are kept as they are. */
export function plainSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[ßæœøðđþıł]/g, (c) => SPELLED_OUT[c] ?? c);
}

/** The words searched for, folded: letters, digits and apostrophes; everything else only separates words. */
export function searchWords(typed: string): string[] {
  return plainSearchText(typed)
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .split(" ")
    .filter(Boolean);
}

/**
 * Whether a charity's text (its fields together, as the website's search column joins them) holds every typed word,
 * in order. Typed text with no words in it finds nothing.
 */
export function matchesSearch(typed: string, fields: readonly (string | null | undefined)[]): boolean {
  const words = searchWords(typed);
  if (words.length === 0) return false;
  const text = plainSearchText(fields.filter(Boolean).join(" "));
  let at = 0;
  for (const word of words) {
    const i = text.indexOf(word, at);
    if (i < 0) return false;
    at = i + word.length;
  }
  return true;
}
