/**
 * A charity's own thank-you paragraph (`charities.thank_you_en`): shown, in the charity's name, wherever a
 * donor is thanked for a gift: the confirmation email, the website's thank-you page and the app's thank-you
 * moment. DRAFT WORDING for Yehuda. Everything else in those places is Givezy's and can't be edited.
 * Plain text only. Pure and dependency-free (the editor's live preview runs it in the browser).
 */

/** The same limit as the column and the profile form. */
export const THANK_YOU_NOTE_MAX = 300;

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​-‏‪-‮⁠⁦-⁩﻿]/g;
/**
 * A plain email address standing on its own (after a space, a bracket or a quote, or at the start), with nothing like
 * a path after it: "info@kitchen.org.za". Only these are allowed through; "https://x.example/pay?r=a@b" is not one.
 */
const PLAIN_EMAIL = /(^|[\s(<"'])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?=$|[\s)>"',;:!?]|\.(?:$|\s))/g;
/**
 * A web address, however it is typed: any "scheme://", "www.", "word.word/" (a path), or a bare domain with a
 * letters-only ending of two or more ("donate.xyz", "t.co", "kitchen.org.za"). The ending is all lower case or all
 * capitals, so a missing space after a full stop ("thank you.We") isn't taken for one; "3.5 tonnes", "R1 250" and
 * "e.g. our team" and "4.5/5" aren't either.
 */
const BARE_DOMAIN = /\b[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:[a-z]{2,}|[A-Z]{2,})(?![A-Za-z0-9])/;
/** Common endings in any capitals ("Donate.Com", "Kitchen.Org.Za"): mail apps still turn these into links. */
const COMMON_ENDING = /\b[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:com|org|net|za|co|io|ly|me|info|biz|ngo|africa|xyz|app|online|site|link|click|top|shop|store|live|church|charity|foundation|fund|gives|donate)(?![A-Za-z0-9])/i;
const OTHER_ADDRESS = /[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z][a-z0-9-]*\//i;

/** Does the text hold a web address, however typed (a plain email address alone is fine). Also used for donor journey emails. */
export function hasWebAddress(text: string): boolean {
  const rest = text.replace(PLAIN_EMAIL, "$1");
  return OTHER_ADDRESS.test(rest) || BARE_DOMAIN.test(rest) || COMMON_ENDING.test(rest);
}

/**
 * The note as it is kept and shown: no hidden or control characters, line breaks kept (at most one empty
 * line in a row), no spaces at the ends of lines, trimmed. Null when nothing is left.
 */
export function cleanThankYouNote(raw: string | null | undefined): string | null {
  const note = (raw ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(/\t/g, " ")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return note || null;
}

/** What the editor accepts. An empty note is fine: it means "Givezy's wording", with no note. */
export function checkThankYouNote(raw: string | null | undefined): { ok: true; note: string | null } | { ok: false; message: string } {
  const note = cleanThankYouNote(raw);
  if (!note) return { ok: true, note: null };
  if (note.length > THANK_YOU_NOTE_MAX) {
    return { ok: false, message: `Please keep it to ${THANK_YOU_NOTE_MAX} characters or fewer. It is ${note.length} now. Nothing was saved.` };
  }
  if (hasWebAddress(note)) {
    return { ok: false, message: "Leave out web addresses: this note can't carry links. Donors find your page through Givezy. Nothing was saved." };
  }
  return { ok: true, note };
}

/** The note for showing to a donor, whatever was saved before these rules: cleaned and never longer than the limit. */
export function thankYouNoteToShow(stored: string | null | undefined): string | null {
  // A note saved before the no-links rule, or written another way, is never shown: it would go out in Givezy's emails.
  const note = cleanThankYouNote(stored);
  if (note && hasWebAddress(note)) return null;
  return note ? note.slice(0, THANK_YOU_NOTE_MAX).trimEnd() : null;
}

/** The label above the note, so it is never mistaken for Givezy's own words. */
export function noteHeading(charityName: string): string {
  return `A note from ${charityName.replace(/\s+/g, " ").trim()}`;
}
