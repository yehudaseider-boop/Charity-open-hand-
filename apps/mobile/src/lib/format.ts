import { formatRand } from "@shared/money";

/** Rand for display: whole Rand drop the cents ("R1 250", "R30"); anything with cents shows them ("R34.57"). */
export function rand(cents: number): string {
  return formatRand(cents);
}

/** South Africa is UTC+2 all year (no daylight saving), so Johannesburg time needs no time-zone database. */
const SAST_MS = 2 * 3_600_000;

/**
 * The Johannesburg calendar day of a moment (a payment time from the database), as a local-midnight date,
 * which is what the calendar code works with. A donor abroad still sees the day it was in South Africa.
 */
export function jhbDay(moment: Date): Date {
  const t = new Date(moment.getTime() + SAST_MS);
  return new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}

/** Today in Johannesburg, as a local-midnight date. */
export function jhbToday(): Date {
  return jhbDay(new Date());
}

/** dd/mm/yyyy of a calendar date (one made by `jhbDay`, or a date the donor picked). */
export function ddmmyyyy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** 24-hour time of a moment, in Johannesburg time, as South Africans write it: "14:05". */
export function hhmm(moment: Date): string {
  const t = new Date(moment.getTime() + SAST_MS);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

