/**
 * Dates as people type them, read the South African way. Dependency-free.
 *
 * Accepted: dd/mm/yyyy or d/m/yyyy (with /, ., - or a space between), ddmmyyyy (a phone's number pad has
 * no slash), and yyyy-mm-dd (our own links and older forms). Never read as mm/dd.
 */

/** yyyy-mm-dd for a real calendar day, or null. */
export function typedDay(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})\s*[/.\- ]\s*(\d{1,2})\s*[/.\- ]\s*(\d{4})$/.exec(s))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{2})(\d{2})(\d{4})$/.exec(s))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  // A year before 1900 is a typing slip (yyyymmdd typed into ddmmyyyy, or a dropped digit), never a real date here.
  if (y < 1900) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** yyyy-mm-dd as dd/mm/yyyy, to fill a date field. Anything else comes back unchanged (so a mistyped value stays as typed). */
export function showDay(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? "");
}

/** The one wording for a date we couldn't read. */
export const TYPED_DAY_MESSAGE = "Write the date as dd/mm/yyyy, for example 31/12/2026";

/**
 * Helps a date box while someone types (23/11/2026): after a complete day or month the slash goes in by itself, so
 * "05" becomes "05/", "05/03" becomes "05/03/", and a pasted "05032026" or "2026-12-31" becomes "05/03/2026" or
 * "31/12/2026". Deleting is never interfered with (the new text is longer than the old only when typing or pasting).
 * Anything else, including words, is left exactly as typed: the server still says what it couldn't read.
 */
export function shapeTypedDay(previous: string, next: string): string {
  const v = next.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  if (/^\d{8}$/.test(v)) return `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
  if (next.length <= previous.length) return next;
  // A separator typed straight after a slash the box added (typing "31/12/2026" key by key): not doubled.
  if (next.length === previous.length + 1 && next.startsWith(previous) && previous.endsWith("/") && /[/.\- ]$/.test(next)) return previous;
  if (/^\d{2}$/.test(v) || /^\d{1,2}[/.\- ]\d{2}$/.test(v)) return `${v.replace(/[.\- ]/g, "/")}/`;
  return next;
}

/** What a date box shows while it is empty. */
export const TYPED_DAY_PLACEHOLDER = "dd/mm/yyyy";
