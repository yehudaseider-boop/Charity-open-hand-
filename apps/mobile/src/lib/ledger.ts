/**
 * The donor's own records: income (for a goal set as a share of income) and giving made elsewhere.
 * Pure functions plus on-phone storage for income, so the website's tests can
 * check them. Amounts are integer cents.
 */
import { labelOf } from "@shared/donations/labels";

/**
 * dd/mm/yyyy typed by a person -> "yyyy-mm-dd", or null if it isn't a real
 * date (no 31/02) or is in the future. `today` is yyyy-mm-dd.
 */
export function parseDdMmYyyy(input: string, today: string): string | null {
  const m = /^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4})$/.exec(input.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  if (y < 2000) return null;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return iso > today ? null : iso;
}

/** "yyyy-mm-dd" -> a Date at local midnight (no time zone shifting). */
export function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export type Elsewhere = { id: string; date: Date; recipient: string; cents: number; label: string | null };
export type ElsewhereRow = { id: string; entry_date: string; recipient_text: string; amount_cents: number | string; kind?: string | null; label?: string | null };

export function toElsewhere(rows: ElsewhereRow[]): Elsewhere[] {
  return rows
    .map((r) => ({ id: r.id, date: isoToDate(r.entry_date), recipient: r.recipient_text, cents: Number(r.amount_cents), label: labelOf(r) }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

export type IncomeEntry = { id: string; date: string; cents: number; note: string };

/** Income entries as read back from the phone: anything malformed is dropped. */
export function cleanIncome(raw: unknown): IncomeEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e): e is IncomeEntry =>
        !!e &&
        typeof e.id === "string" &&
        typeof e.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(e.date) &&
        Number.isSafeInteger(e.cents) &&
        e.cents > 0 &&
        typeof e.note === "string",
    )
    .map((e) => ({ id: e.id, date: e.date, cents: e.cents, note: e.note.slice(0, 120) }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Income dated from `from` up to and including `to` (both "yyyy-mm-dd"). */
export function incomeBetween(entries: IncomeEntry[], from: string, to: string): number {
  return entries.filter((e) => e.date >= from && e.date <= to).reduce((s, e) => s + e.cents, 0);
}

export const dateToIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
