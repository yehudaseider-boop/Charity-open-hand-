/**
 * Trying an important email again (10/11/2026): a donor's gift confirmation, an s18A receipt or a declined-card
 * notice that failed to send is tried again by the daily job: an hour after it failed (in practice the next daily
 * run), then a day later, then three days after that. After three more tries it stops and Givezy is told once.
 * Pure rules, no database: the daily job (./retry) applies them.
 */

/** The emails tried again. Marketing-type sends (appeals, journeys, thank-yous) have their own handling. */
export const RETRY_KINDS = ["donation_confirmation", "s18a_receipt", "monthly_declined"] as const;
export type RetryKind = (typeof RETRY_KINDS)[number];

/** Hours to wait before each try again, counted from the try that failed. */
export const RETRY_DELAYS_HOURS = [1, 24, 72] as const;
/** The first send plus three tries again. */
export const MAX_TRIES = 1 + RETRY_DELAYS_HOURS.length;
/** A row noted longer ago than this isn't tried any more: what it says may be stale. */
export const RETRY_MAX_AGE_DAYS = 7;

/**
 * What one try again came to:
 * - "sent": a real email left.
 * - "skipped": nothing was sent on purpose (an erased donor, or an address the test site may not email): not a
 *   failure, never tried again.
 * - "gone": there is nothing to send any more (the gift was refunded, the receipt was emailed another way, the
 *   donor already put in a new card).
 * - "busy": another run is sending it right now: look again later, without using up a try.
 * - "unknown": the send was cut off (a time limit, or a run that stopped mid-send): it may have gone. Never tried
 *   again by itself, so the donor never gets two; a person checks it.
 * - "failed": the send did not work.
 */
export type RetryResult = "sent" | "skipped" | "gone" | "busy" | "unknown" | "failed";

export type RetryStatus = "waiting" | "sent" | "skipped" | "gone" | "unknown" | "gave_up";

const HOUR = 3_600_000;

/** On the hour, rounded down: a job that runs once a day (a little after the hour) then finds a try due on the day meant, not a day late. */
const onTheHour = (ms: number) => new Date(ms - (ms % HOUR));

/** When to try again after `tries` failed tries (the first send counts as one), or null when it's time to stop. */
export function nextTryAt(tries: number, failedAt: Date): Date | null {
  if (!Number.isInteger(tries) || tries < 1 || tries >= MAX_TRIES) return null;
  return onTheHour(failedAt.getTime() + RETRY_DELAYS_HOURS[tries - 1] * HOUR);
}

/** The row after a try again: its status, how many tries it has had, and when to look again. */
export function afterTry(tries: number, result: RetryResult, now: Date): { status: RetryStatus; tries: number; nextTryAt: Date | null } {
  switch (result) {
    case "sent":
    case "skipped":
    case "gone":
    case "unknown":
      return { status: result, tries: tries + 1, nextTryAt: null };
    case "busy":
      // Not a try: someone else has it. Look again on the next run.
      return { status: "waiting", tries, nextTryAt: onTheHour(now.getTime() + HOUR) };
    case "failed": {
      const used = tries + 1;
      const next = nextTryAt(used, now);
      return next ? { status: "waiting", tries: used, nextTryAt: next } : { status: "gave_up", tries: used, nextTryAt: null };
    }
  }
}

/** Too old to try: noted more than RETRY_MAX_AGE_DAYS ago. */
export function tooOld(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() > RETRY_MAX_AGE_DAYS * 24 * HOUR;
}

/** A send that was cut off by a time limit or an abort: it may still have gone. */
export function wasCutOff(e: unknown): boolean {
  const name = e && typeof e === "object" && "name" in e ? String((e as { name: unknown }).name) : "";
  return name === "AbortError" || name === "TimeoutError";
}

/** A failure message as kept with the row: one line, short, and never an email address. */
export function safeErrorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw
    .replace(/[^\s@<>"']+@[^\s@<>"']+/g, "[email]")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 300);
}

/** Is real email switched on? With the console transport nothing is sent, so nothing is tried again or marked sent. */
export function emailIsOn(env: Record<string, string | undefined> = process.env): boolean {
  return (env.EMAIL_TRANSPORT ?? "console") !== "console";
}

const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

/** Lines in Givezy's daily email about emails tried again, counts only. Empty when there's nothing for a person. */
export function retryDigestLines(r: { gaveUp: number; expired: number; unknown: number; broken?: boolean }): string[] {
  const lines: string[] = [];
  if (r.broken) lines.push("Trying failed emails to donors again could not run today (see the job log). It runs again tomorrow.");
  if (r.gaveUp > 0)
    lines.push(
      `${n(r.gaveUp, "important email", "important emails")} to donors (a gift confirmation, an s18A receipt or a declined-card notice) still could not be sent after ${RETRY_DELAYS_HOURS.length} more tries. Each is in the audit log as email.retry_gave_up; resend it by hand.`,
    );
  if (r.expired > 0) lines.push(`${n(r.expired, "failed email", "failed emails")} to donors waited more than ${RETRY_MAX_AGE_DAYS} days and won't be tried again (email.retry_gave_up in the audit log); check whether to resend by hand.`);
  if (r.unknown > 0) lines.push(`${n(r.unknown, "email", "emails")} to donors may or may not have gone (the send was cut off). Each is in the audit log as email.retry_unknown: check before resending, so nobody gets two.`);
  return lines;
}
