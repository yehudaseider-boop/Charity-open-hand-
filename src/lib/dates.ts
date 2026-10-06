/**
 * Date helpers. Display is always dd/mm/yyyy in South African time.
 *
 * Tax years follow SARS: a tax year is named by the year it ENDS.
 * Tax year 2027 runs from 01/03/2026 to 28/02/2027.
 */
import { platformConfig } from "@/config/platform";

const { timeZone, locale } = platformConfig;

function zonedParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** 2026-10-06T14:00:00Z -> "06/10/2026" (in Johannesburg time). */
export function formatDate(date: Date | string): string {
  const { year, month, day } = zonedParts(new Date(date));
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

/** "06/10/2026 16:00" in Johannesburg time, 24-hour clock. */
export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${formatDate(d)} ${time}`;
}

/** The SARS tax year (named by its end year) that a moment falls in. */
export function taxYearFor(date: Date | string): number {
  const { year, month } = zonedParts(new Date(date));
  return month >= platformConfig.taxYear.startMonth ? year + 1 : year;
}

/** First and last calendar day of a tax year, as yyyy-mm-dd strings. */
export function taxYearRange(taxYear: number): { start: string; end: string } {
  const startMonth = platformConfig.taxYear.startMonth;
  const start = `${taxYear - 1}-${String(startMonth).padStart(2, "0")}-01`;
  // Day before the next start: use UTC maths on a calendar date (no time zone involved).
  const nextStart = Date.UTC(taxYear, startMonth - 1, 1);
  const last = new Date(nextStart - 24 * 60 * 60 * 1000);
  const end = `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, "0")}-${String(last.getUTCDate()).padStart(2, "0")}`;
  return { start, end };
}

/** "Tax year 2027 (01/03/2026 to 28/02/2027)" */
export function taxYearLabel(taxYear: number): string {
  const { start, end } = taxYearRange(taxYear);
  const fmt = (iso: string) => iso.split("-").reverse().join("/");
  return `Tax year ${taxYear} (${fmt(start)} to ${fmt(end)})`;
}
