/**
 * Donor care (21/10/2026): the rules for notes, follow-up reminders, tags, saved donor lists and the lapsed
 * period. Pure: no database, no clock (the caller passes "today", yyyy-mm-dd in Johannesburg time).
 */
import { isDonorGroup, type DonorGroup } from "./insights";
import { TYPED_DAY_MESSAGE, typedDay } from "@/lib/typed-date";

/** Line breaks kept in notes; control and direction characters removed (they could hide text). */
function clean(v: string, keepLines: boolean): string {
  const s = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‎‏‪-‮⁦-⁩]/g, "");
  return (keepLines ? s.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ")).trim();
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export function checkNote(raw: unknown): Checked<string> {
  const body = clean(String(raw ?? ""), true);
  if (!body) return { ok: false, error: "Write the note first" };
  if (body.length > 2000) return { ok: false, error: `Keep a note to 2 000 characters (this one is ${body.length})` };
  return { ok: true, value: body };
}

/** A follow-up: what to do and when, from today up to two years ahead. */
export function checkReminder(what: unknown, dueOn: unknown, today: string): { ok: true; what: string; dueOn: string } | { ok: false; errors: Record<string, string> } {
  const e: Record<string, string> = {};
  const w = clean(String(what ?? ""), false);
  if (!w) e.what = "Say what to do, for example \"Phone to thank for the Pesach gift\"";
  else if (w.length > 300) e.what = "Keep it to 300 characters";
  const typed = String(dueOn ?? "").trim();
  const d = typedDay(typed) ?? typed;
  if (!typed) e.due_on = "Enter a date";
  else if (!typedDay(typed)) e.due_on = TYPED_DAY_MESSAGE;
  else if (d < today) e.due_on = "Choose today or a later date";
  else if (d > `${Number(today.slice(0, 4)) + 2}${today.slice(4)}`) e.due_on = "Choose a date within the next two years";
  return Object.keys(e).length ? { ok: false, errors: e } : { ok: true, what: w, dueOn: d };
}

export function checkTagName(raw: unknown): Checked<string> {
  const name = clean(String(raw ?? ""), false);
  if (!name) return { ok: false, error: "Give the tag a name" };
  if (name.length > 40) return { ok: false, error: "Keep a tag name to 40 characters" };
  return { ok: true, value: name };
}

export type SegmentFilters = { group?: DonorGroup; tag?: string; q?: string };

/** What a saved list may hold: a donor group, a tag (one of the charity's own) and a search. */
export function checkSegment(name: unknown, filters: { group?: unknown; tag?: unknown; q?: unknown }, tagIds: Set<string>): Checked<{ name: string; filters: SegmentFilters }> {
  const n = clean(String(name ?? ""), false);
  if (!n) return { ok: false, error: "Give the list a name, for example \"Lapsed monthly donors\"" };
  if (n.length > 60) return { ok: false, error: "Keep the name to 60 characters" };
  const f: SegmentFilters = {};
  if (isDonorGroup(filters.group)) f.group = filters.group;
  if (typeof filters.tag === "string" && tagIds.has(filters.tag)) f.tag = filters.tag;
  if (typeof filters.q === "string" && filters.q.trim()) f.q = clean(filters.q, false).slice(0, 80);
  if (!f.group && !f.tag && !f.q) return { ok: false, error: "Choose a group, a tag or a search first: there's nothing to save yet" };
  return { ok: true, value: { name: n, filters: f } };
}

/** The lapsed period a charity may choose: 30 days to two years, in whole days. */
export function checkLapsedDays(raw: unknown): Checked<number> {
  const s = String(raw ?? "").trim();
  if (!/^\d{1,3}$/.test(s)) return { ok: false, error: "Enter a number of days, for example 180" };
  const n = Number(s);
  if (n < 30 || n > 730) return { ok: false, error: "Choose between 30 and 730 days" };
  return { ok: true, value: n };
}

/** Reminders that are due (today or earlier) come first, then the rest by date. */
export function sortReminders<T extends { due_on: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.due_on.localeCompare(b.due_on));
}

/** What a donor-care action just did, said at the top of the page after it (the form itself has gone). */
export const CARE_DONE: Record<string, string> = {
  note_removed: "Note removed.",
  followup_done: "Follow-up marked done. It's under \"Done recently\" if you need to put it back.",
  followup_back: "Follow-up back on your list.",
  followup_removed: "Follow-up removed.",
  tag_off: "Tag taken off this donor. Add it again below if that was a mistake.",
  tag_deleted: "Tag deleted and taken off every donor.",
  list_removed: "Saved list removed. The donors in it are not changed.",
};
