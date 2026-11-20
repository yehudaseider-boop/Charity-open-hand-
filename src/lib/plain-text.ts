/**
 * Typographic punctuation as the plain characters on a keyboard, for names and addresses (20/11/2026). An iPhone
 * types O'Brien with a curly apostrophe (U+2019), which SARS's IT3(d) file can't hold (it takes Latin-1 only), so
 * a donor's name would block the charity's file. Applied where names and addresses are typed and saved, never in
 * the SARS file builder (that one never changes a value silently).
 *
 * Only punctuation and spaces change. Letters are left as typed: é, ü and ñ are Latin-1 and fine, and a letter
 * outside it (ễ) is the person's real name, for Givezy to sort out with the charity, not to rewrite here.
 * Dependency-free.
 */

const MAP: Record<string, string> = {
  // Single quotes, apostrophes and the prime mark.
  "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'",
  // Double quotes and the double prime.
  "“": '"', "”": '"', "„": '"', "‟": '"', "″": '"',
  // Hyphens and dashes (hyphen, non-breaking hyphen, figure dash, en dash, em dash, horizontal bar) and minus.
  "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-", "−": "-",
  "…": "...",
};

/** Non-breaking and other odd spaces (no-break, ogham, en to hair, narrow no-break, medium maths, ideographic). */
const ODD_SPACES = /[   -   　]/g;
/** Spaces with no width (zero-width space, word joiner, byte order mark): nothing to show, so dropped. */
const NO_WIDTH = /[​⁠﻿]/g;
const PUNCTUATION = new RegExp(`[${Object.keys(MAP).join("")}]`, "g");

/** The text with typographic quotes, dashes, the ellipsis and odd spaces made plain. Everything else as typed. */
export function plainPunctuation(s: string): string {
  return s.replace(PUNCTUATION, (ch) => MAP[ch]).replace(ODD_SPACES, " ").replace(NO_WIDTH, "");
}
