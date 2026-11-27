import { cleanSettings, gaveInMonth, nextReminderAt, NO_REMINDER, type ReminderSettings } from "./reminders";
import { clearReminder, reminderPermission, setReminder } from "./phone-reminders";
import { secureStorage } from "./secure-storage";

/**
 * The payday reminder's setting, kept on this phone (the reminder itself lives on this phone too). One per phone:
 * whoever uses the phone gets the reminder, as with any phone alarm.
 */
export const REMINDER_KEY = "nediv-lev.payday-reminder";

/** What the phone holds; an unreadable record reads as "no reminder" (and the next save replaces it). */
export async function loadReminder(): Promise<ReminderSettings> {
  try {
    const raw = await secureStorage.getItem(REMINDER_KEY);
    return raw === null ? NO_REMINDER : cleanSettings(JSON.parse(raw));
  } catch {
    return NO_REMINDER;
  }
}

export async function saveReminder(s: ReminderSettings): Promise<boolean> {
  try {
    await secureStorage.setItem(REMINDER_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

/** How the reminder stands after a check: when it goes off next, or why it doesn't. */
export type ReminderState =
  | { kind: "off" }
  | { kind: "set"; next: Date }
  /** On, but the phone said no to notifications (or took it back in Settings): nothing goes off. */
  | { kind: "blocked" }
  /** On, but the phone wouldn't take the reminder just now. */
  | { kind: "failed" }
  /** This build or the web can't set reminders. */
  | { kind: "unavailable" };

/**
 * Puts the phone's reminder in line with the setting and the donor's gifts: the next date (skipping a month they
 * already gave in, or said "Not this month" to), or none. Run when the app opens or comes back, after the donor's gifts
 * load or change, and after any change to the setting. Safe to repeat: it always replaces the one reminder.
 */
export async function syncReminder(settings: ReminderSettings, giftDates: readonly Date[], now = new Date()): Promise<ReminderState> {
  const next = nextReminderAt(settings, now, gaveInMonth(giftDates));
  if (!settings.on || !settings.day || !next) {
    await clearReminder();
    return { kind: "off" };
  }
  const permission = await reminderPermission();
  if (permission === "unavailable") return { kind: "unavailable" };
  if (permission !== "granted") {
    await clearReminder();
    return { kind: "blocked" };
  }
  return (await setReminder(next, settings.day)) ? { kind: "set", next } : { kind: "failed" };
}
