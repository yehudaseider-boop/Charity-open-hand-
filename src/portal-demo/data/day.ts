/** Calendar-day helpers on "yyyy-mm-dd" strings. UTC maths on dates only, so no time zone slips in. */

const DAY_MS = 24 * 60 * 60 * 1000;

function toMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

export function addDays(day: string, n: number): string {
  return new Date(toMs(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from a to b (b later gives a positive number). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toMs(b) - toMs(a)) / DAY_MS);
}

/** 0 Sunday to 6 Saturday. */
export function weekday(day: string): number {
  return new Date(toMs(day)).getUTCDay();
}

export function monthOf(day: string): number {
  return Number(day.slice(5, 7));
}

/** "2026-10" for a day. */
export function monthKey(day: string): string {
  return day.slice(0, 7);
}

/** First day of the month, n months after the month of `day` (negative goes back). */
export function addMonths(day: string, n: number): string {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7)) - 1 + n;
  const ny = y + Math.floor(m / 12);
  const nm = ((m % 12) + 12) % 12;
  return `${ny}-${String(nm + 1).padStart(2, "0")}-01`;
}

/** "yyyy-mm-dd" to "dd/mm/yyyy". */
export function showDay(day: string): string {
  const [y, m, d] = day.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10" to "Oct 2026", or "Oct" when short. */
export function showMonth(key: string, short = false): string {
  const name = MONTHS[Number(key.slice(5, 7)) - 1];
  return short ? name : `${name} ${key.slice(0, 4)}`;
}
