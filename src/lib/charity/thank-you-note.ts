/**
 * A charity's own thank-you paragraph (`charities.thank_you_en`): shown, in the charity's name, wherever a
 * donor is thanked for a gift: the confirmation email, the website's thank-you page and the app's thank-you
 * moment. DRAFT WORDING for Yehuda. Everything else in those places is Givezy's and can't be edited.
 * Plain text only. Pure and dependency-free (the editor's live preview runs it in the browser).
 */

/** The same limit as the column and the profile form. */
export const THANK_YOU_NOTE_MAX = 300;

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​-‏‪-‮⁠⁦-⁩﻿]/g;
/** A web address, however it is typed: "https://…", "www.…" or "example.org.za/page". */
const WEB_ADDRESS = /(?:https?:\/\/|www\.)\S|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:co\.za|org\.za|net\.za|ac\.za|gov\.za|com|org|net|africa|io|ly|me)\b/i;

/** Does the text hold a web address, however typed (an email address alone is fine). Also used for donor journey emails. */
export function hasWebAddress(text: string): boolean {
  return WEB_ADDRESS.test(text.replace(/\S+@\S+/g, ""));
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
  if (WEB_ADDRESS.test(note.replace(/\S+@\S+/g, ""))) {
    return { ok: false, message: "Leave out web addresses: this note can't carry links. Donors find your page through Givezy. Nothing was saved." };
  }
  return { ok: true, note };
}

/** The note for showing to a donor, whatever was saved before these rules: cleaned and never longer than the limit. */
export function thankYouNoteToShow(stored: string | null | undefined): string | null {
  // A note saved before the no-links rule, or written another way, is never shown: it would go out in Givezy's emails.
  const note = cleanThankYouNote(stored);
  if (note && WEB_ADDRESS.test(note.replace(/\S+@\S+/g, ""))) return null;
  return note ? note.slice(0, THANK_YOU_NOTE_MAX).trimEnd() : null;
}

/** The label above the note, so it is never mistaken for Givezy's own words. */
export function noteHeading(charityName: string): string {
  return `A note from ${charityName.replace(/\s+/g, " ").trim()}`;
}
