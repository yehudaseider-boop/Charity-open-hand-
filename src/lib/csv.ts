/**
 * CSV for exports. Opening a CSV in a spreadsheet can run a "formula" if a cell
 * starts with = + - or @, and donors type their own names and messages, so any
 * text cell that could be read as a formula gets a leading apostrophe. South African Excel splits a CSV on
 * semicolons (comma is the decimal mark), so a cell holding a ; is quoted too, and a formula hidden after one
 * ("Thanks;=cmd…") is defused the same way.
 */

const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  s = s.replace(/([;,])(\s*)([=+\-@])/g, "$1$2'$3");
  if (/[",;\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * A phone number a spreadsheet keeps as written. A bare 0821234567 opens as the number 821234567 (the 0 is
 * lost), so South African numbers are written grouped, "082 123 4567", which stays text. Other numbers keep
 * their + and are written as text by csvCell.
 */
export function csvPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/[^\d+]/g, "");
  const local = /^\+27\d{9}$/.test(digits) ? `0${digits.slice(3)}` : /^0\d{9}$/.test(digits) ? digits : null;
  if (local) return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  return phone;
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
