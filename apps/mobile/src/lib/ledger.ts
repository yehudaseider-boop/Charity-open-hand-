/**
 * The donor's own records: income (for maaser) and giving made elsewhere.
 * Pure functions plus on-phone storage for income, so the website's tests can
 * check them. Amounts are integer cents.
 */
import { percentToPpm } from "@shared/money";
import type { GivingKind } from "../data/giving";
import { maaserTargetCents } from "./giving";

/** Maaser is a tenth of income; chomesh a further tenth. */
export const TENTH_PPM = percentToPpm("10");

export const isKind = (k: unknown): k is GivingKind => k === "maaser" || k === "chomesh" || k === "tzedaka";

/** Today's date as dd/mm/yyyy for a form's starting value (the phone's own date). */
export function todayDdMmYyyy(now = new Date()): string {
  return `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
}

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

export type Elsewhere = { id: string; date: Date; recipient: string; cents: number; kind: GivingKind };
export type ElsewhereRow = { id: string; entry_date: string; recipient_text: string; amount_cents: number | string; kind: string };

export function toElsewhere(rows: ElsewhereRow[]): Elsewhere[] {
  return rows
    .filter((r) => isKind(r.kind))
    .map((r) => ({ id: r.id, date: isoToDate(r.entry_date), recipient: r.recipient_text, cents: Number(r.amount_cents), kind: r.kind as GivingKind }))
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

/** What income in a period means for maaser (a tenth) and, if kept, chomesh (a further tenth). */
export function owedFromIncome(incomeCents: number, keepsChomesh: boolean): { maaserCents: number; chomeshCents: number } {
  const tenth = maaserTargetCents(incomeCents, TENTH_PPM);
  return { maaserCents: tenth, chomeshCents: keepsChomesh ? tenth : 0 };
}

export const dateToIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
