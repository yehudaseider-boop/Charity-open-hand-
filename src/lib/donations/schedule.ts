/**
 * When monthly donations are collected. Pure: no database, no clock.
 *
 * A month is "yyyy-mm" in Johannesburg time. A donor is collected once a month on the day of
 * the month they first gave (days 29 to 31 fall on the last day of shorter months), at 08:00
 * Johannesburg time (06:00 UTC: South Africa has no daylight saving). A paused month is never
 * collected later: when the donor resumes, only the current month is collected.
 */
import { createHash } from "node:crypto";
import { zonedParts } from "@/lib/dates";

/** Attempts per month before the monthly donation is marked failed. */
export const MAX_ATTEMPTS = 3;
/** Hours to wait before the next try, after the first and second failed attempt. */
export const RETRY_AFTER_HOURS = [24, 72];

export type Period = string; // "yyyy-mm"

export function periodOf(date: Date): Period {
  const { year, month } = zonedParts(date);
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** The day of the month (Johannesburg) a donor first gave on. */
export function chargeDayOf(date: Date): number {
  return zonedParts(date).day;
}

export function addMonths(period: Period, n: number): Period {
  const [y, m] = period.split("-").map(Number);
  const index = y * 12 + (m - 1) + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function daysInMonth(period: Period): number {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The moment a month's collection is due: 08:00 Johannesburg time on the charge day (06:00 UTC). */
export function chargeTime(period: Period, chargeDay: number): Date {
  const [y, m] = period.split("-").map(Number);
  const day = Math.min(chargeDay, daysInMonth(period));
  return new Date(Date.UTC(y, m - 1, day, 6, 0, 0));
}

/** When to try again after `failedAttempts` failures this month, or null when the attempts are used up. */
export function retryTime(now: Date, failedAttempts: number): Date | null {
  if (failedAttempts >= MAX_ATTEMPTS) return null;
  const hours = RETRY_AFTER_HOURS[failedAttempts - 1] ?? RETRY_AFTER_HOURS[RETRY_AFTER_HOURS.length - 1];
  return new Date(now.getTime() + hours * 3_600_000);
}

/**
 * The donation id for one attempt to collect one month. The same inputs always give the same id,
 * so a job that runs twice (or crashes half-way) can never create two charges for one attempt.
 */
export function attemptDonationId(recurringId: string, period: Period, attempt: number): string {
  const h = createHash("sha256").update(`monthly:${recurringId}:${period}:${attempt}`).digest("hex");
  // Shape as a version-4 UUID (the rest of the system expects UUID references).
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
