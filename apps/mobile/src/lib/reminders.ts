/**
 * The payday reminder (decided 09/11/2026, built 27/11/2026): a once-a-month nudge on a day the donor picks, kept on
 * this phone only. These are its rules, with no phone parts, so every case is tested (tests/app-reminders.test.ts).
 *
 * - The donor picks the 1st, 15th, 20th, 25th or the last day of the month. It goes off at 09:00 that day.
 * - Never more than once a month, and skipped for a month the donor already gave in: the next one moves to next month.
 * - The words were approved by Yehuda: "It's the 25th. Your charities are a tap away, if you'd like to give this month."
 *
 * Shared nowhere else, no imports: dates are the phone's own calendar days, as the app's gift dates are.
 */

export const REMINDER_DAYS = [1, 15, 20, 25, "last"] as const;
export type ReminderDay = (typeof REMINDER_DAYS)[number];

/** The hour of the day it goes off (the phone's own time). */
export const REMINDER_HOUR = 9;

/**
 * What the phone keeps. `on` with a day: a reminder is set. `askedAt`: when the donor was last offered it (so it is
 * offered once, never pushed again). `skipMonth`: "Not this month" for that month ("2026-12"), so it skips to the next.
 */
export type ReminderSettings = { on: boolean; day: ReminderDay | null; askedAt: string | null; skipMonth: string | null };
export const NO_REMINDER: ReminderSettings = { on: false, day: null, askedAt: null, skipMonth: null };

export function isReminderDay(v: unknown): v is ReminderDay {
  return (REMINDER_DAYS as readonly unknown[]).includes(v);
}

/** Settings read back from the phone, whatever was stored: anything odd becomes "no reminder", never a crash. */
export function cleanSettings(raw: unknown): ReminderSettings {
  if (!raw || typeof raw !== "object") return NO_REMINDER;
  const r = raw as Record<string, unknown>;
  const day = isReminderDay(r.day) ? r.day : null;
  const text = (v: unknown, pattern: RegExp) => (typeof v === "string" && pattern.test(v) ? v : null);
  return {
    on: r.on === true && day !== null,
    day,
    askedAt: text(r.askedAt, /^\d{4}-\d{2}-\d{2}/),
    skipMonth: text(r.skipMonth, /^\d{4}-\d{2}$/),
  };
}

/** "2026-12" for a date's month (the phone's calendar). */
export const monthKeyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** The reminder's day in a given month: the 25th, or the last day (28 to 31). */
function dayIn(year: number, month: number, day: ReminderDay): Date {
  const date = day === "last" ? new Date(year, month + 1, 0).getDate() : day;
  return new Date(year, month, date, REMINDER_HOUR, 0, 0, 0);
}

/**
 * How many months ahead the phone holds a reminder (review 27/11/2026). One at a time meant the reminder stopped after
 * it went off, until the app was next opened; six ahead keep it going for half a year without the app, and every open
 * of the app tops them up (and takes away a month the donor has since given in).
 */
export const REMINDER_MONTHS_AHEAD = 6;

/**
 * The next reminders, soonest first: this month's day if it is still ahead and this month is still open, then the
 * following months'. A month is closed when the donor already gave in it, or said "Not this month" for it. Empty when
 * no reminder is set.
 */
export function upcomingReminders(settings: ReminderSettings, now: Date, gaveIn: (monthKey: string) => boolean, count = REMINDER_MONTHS_AHEAD): Date[] {
  if (!settings.on || settings.day === null) return [];
  const out: Date[] = [];
  for (let i = 0; i < count + 13 && out.length < count; i += 1) {
    const at = dayIn(now.getFullYear(), now.getMonth() + i, settings.day);
    const key = monthKeyOf(at);
    if (at.getTime() <= now.getTime()) continue;
    if (key === settings.skipMonth || gaveIn(key)) continue;
    out.push(at);
  }
  return out;
}

/** When the next reminder goes off, or null when none is set. */
export function nextReminderAt(settings: ReminderSettings, now: Date, gaveIn: (monthKey: string) => boolean): Date | null {
  return upcomingReminders(settings, now, gaveIn, 1)[0] ?? null;
}

/**
 * The setting after the donor picks a day (review 27/11/2026). A first reminder starts fresh. A change of day keeps
 * "Not this month", and when this month's reminder already went off on the old day, this month stays closed: changing
 * from the 20th to the 25th on the 21st must not remind them twice in one month.
 */
export function withDay(previous: ReminderSettings | null, day: ReminderDay, now: Date, askedAt: string): ReminderSettings {
  if (!previous?.on || previous.day === null) return { on: true, day, askedAt, skipMonth: null };
  const thisMonth = monthKeyOf(now);
  const wentOff = dayIn(now.getFullYear(), now.getMonth(), previous.day).getTime() <= now.getTime();
  return { on: true, day, askedAt, skipMonth: wentOff ? thisMonth : previous.skipMonth };
}

/** Whether the donor gave in a month, from their gift dates. */
export function gaveInMonth(giftDates: readonly Date[]): (monthKey: string) => boolean {
  const months = new Set(giftDates.map(monthKeyOf));
  return (key) => months.has(key);
}

/** "1st", "15th", "20th", "25th", "last day". */
export function dayName(day: ReminderDay): string {
  if (day === "last") return "last day";
  return day === 1 ? "1st" : `${day}th`;
}

/** The notification's own words, for the day it goes off. Approved by Yehuda (09/11/2026). */
export function reminderMessage(day: ReminderDay): { title: string; body: string } {
  const when = day === "last" ? "It's the last day of the month." : `It's the ${dayName(day)}.`;
  return { title: "Givezy", body: `${when} Your charities are a tap away, if you'd like to give this month.` };
}

/** The button that asks: the outcome, never "Allow" (27/11/2026: ask for the outcome, the permission follows). */
export function remindButton(day: ReminderDay): string {
  return day === "last" ? "Remind me on the last day" : `Remind me on the ${dayName(day)}`;
}

/** dd/mm/yyyy, as dates are written everywhere in Givezy. */
export function ddmmyyyy(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** The donor's reminder in one line: "On the 25th of each month. Next: 25/12/2026." */
export function reminderSummary(settings: ReminderSettings, next: Date | null): string | null {
  if (!settings.on || settings.day === null) return null;
  const day = settings.day === "last" ? "On the last day of each month." : `On the ${dayName(settings.day)} of each month.`;
  return next ? `${day} Next: ${ddmmyyyy(next)}.` : day;
}
