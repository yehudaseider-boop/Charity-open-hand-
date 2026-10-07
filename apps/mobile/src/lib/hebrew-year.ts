/**
 * Giving year: Rosh Hashana to the day before the next Rosh Hashana, named by
 * the Hebrew year it starts (5787 = 12/09/2026 to 01/10/2027). Rosh Hashana is
 * worked out with the standard fixed-arithmetic Hebrew calendar, so no dates
 * are typed in. Dates are civil days (the evening before is not split out).
 */

/** Fixed day number (1 = 01/01/0001) of the Hebrew epoch. */
const HEBREW_EPOCH = -1_373_427;
/** Fixed day number of 01/01/1970. */
const UNIX_EPOCH = 719_163;

function elapsedDays(year: number): number {
  const months = Math.floor((235 * year - 234) / 19);
  const parts = 12_084 + 13_753 * months;
  const day = months * 29 + Math.floor(parts / 25_920);
  return (3 * (day + 1)) % 7 < 3 ? day + 1 : day;
}

function yearLengthCorrection(year: number): number {
  const ny0 = elapsedDays(year - 1);
  const ny1 = elapsedDays(year);
  const ny2 = elapsedDays(year + 1);
  if (ny2 - ny1 === 356) return 2;
  if (ny1 - ny0 === 382) return 1;
  return 0;
}

/** First day (Rosh Hashana) of a Hebrew year, as a local calendar date. */
export function roshHashana(hebrewYear: number): Date {
  const fixed = HEBREW_EPOCH + elapsedDays(hebrewYear) + yearLengthCorrection(hebrewYear);
  const utc = new Date((fixed - UNIX_EPOCH) * 86_400_000);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

/** The Hebrew year (named by its Rosh Hashana) that a date falls in. */
export function hebrewYearFor(d: Date): number {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let y = d.getFullYear() + 3761;
  while (day < roshHashana(y)) y--;
  while (day >= roshHashana(y + 1)) y++;
  return y;
}

/** Last day of the giving year: the day before the next Rosh Hashana. */
export function givingYearEnd(hebrewYear: number): Date {
  const next = roshHashana(hebrewYear + 1);
  return new Date(next.getFullYear(), next.getMonth(), next.getDate() - 1);
}

export function givingYearRange(hebrewYear: number): { start: Date; end: Date } {
  return { start: roshHashana(hebrewYear), end: givingYearEnd(hebrewYear) };
}

/** Whole calendar months from a date to the end of the giving year, at least 1. */
export function monthsLeftInGivingYear(d: Date, hebrewYear: number): number {
  const next = roshHashana(hebrewYear + 1);
  const months = (next.getFullYear() - d.getFullYear()) * 12 + (next.getMonth() - d.getMonth());
  return Math.max(1, months);
}
