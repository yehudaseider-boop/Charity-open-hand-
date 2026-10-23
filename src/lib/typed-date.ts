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
