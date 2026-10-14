/**
 * CSV for exports. Opening a CSV in a spreadsheet can run a "formula" if a cell
 * starts with = + - or @, and donors type their own names and messages, so any
 * text cell that could be read as a formula gets a leading apostrophe.
 */

const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;
const PHONE = /^\+?\d[\d ]*$/;

export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !PLAIN_NUMBER.test(s) && !PHONE.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Header and rows to CSV text, with a byte order mark so Excel reads accents and Hebrew correctly. */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Whole cents as "1250.00" for a spreadsheet. Integer maths only. */
export function centsToPlain(cents: number | string): string {
  const n = BigInt(cents);
  const abs = n < 0n ? -n : n;
  return `${n < 0n ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
