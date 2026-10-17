/**
 * Thank-you emails from a charity to the people who gave in a month. DRAFT WORDING for Yehuda.
 * Givezy sends them, so the charity never handles donors' addresses. Pure helpers (tested).
 */
import { createHash } from "node:crypto";
import type { EmailMessage } from "@/lib/email";
import { saDate } from "./dashboard";

export const THANK_YOU_MAX = 1000;
export const THANK_YOU_MIN = 10;

/** sha256 of the address in lower case: how opt-outs are kept without storing the address. */
export function emailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/** "2026-10-01" -> "October 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** This month and the two before it, newest first, as the first day of each month (Johannesburg calendar). */
export function recentMonths(now: Date, count = 3): string[] {
  const [y, m] = saDate(now).split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const total = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`);
  }
  return out;
}

/** The month as timestamps for the database: first moment to the first moment of the next month. */
export function monthPeriod(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from: `${month}T00:00:00+02:00`, to: `${next}T00:00:00+02:00` };
}

export function checkThankYou(raw: string): { ok: true; body: string } | { ok: false; message: string } {
  const body = raw
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .trim();
  if (body.length < THANK_YOU_MIN) return { ok: false, message: "Write a few words of thanks." };
  if (body.length > THANK_YOU_MAX) return { ok: false, message: `Keep it to ${THANK_YOU_MAX} characters.` };
  return { ok: true, body };
}

/** One donor's thank-you. Their first name only: never amounts, other donors or anything else. */
export function thankYouEmail(
  to: string,
  v: { charityName: string; firstName: string | null; month: string; body: string; stopUrl: string },
): EmailMessage {
  const name = v.firstName?.trim();
  return {
    to,
    subject: `A thank-you from ${v.charityName}`,
    text: [
      name ? `Dear ${name},` : "Hello,",
      "",
      `${v.charityName} asked us to pass this on to everyone who gave to them in ${monthLabel(v.month)}:`,
      "",
      v.body,
      "",
      "",
      `You're getting this because you gave to ${v.charityName} on Givezy. To stop thank-you emails from charities: ${v.stopUrl}`,
      "",
      "The Givezy team",
    ].join("\n"),
  };
}
