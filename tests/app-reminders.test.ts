/**
 * The app's payday reminder rules (27/11/2026): when it goes off, that it skips a month the donor already gave in or
 * said "Not this month" to, the last day of short months, the approved words, and settings read back safely.
 */
import { describe, expect, it } from "vitest";
import {
  NO_REMINDER,
  cleanSettings,
  ddmmyyyy,
  gaveInMonth,
  nextReminderAt,
  reminderMessage,
  remindButton,
  reminderSummary,
  type ReminderSettings,
} from "../apps/mobile/src/lib/reminders";

const on = (day: ReminderSettings["day"], more: Partial<ReminderSettings> = {}): ReminderSettings => ({ ...NO_REMINDER, on: true, day, ...more });
const never = () => false;
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe("when the next reminder goes off", () => {
  it("this month's day at 09:00 when it is still ahead", () => {
    expect(nextReminderAt(on(25), at(2026, 11, 20), never)).toEqual(new Date(2026, 10, 25, 9));
  });
  it("next month once this month's day has passed, or on the day itself after 09:00", () => {
    expect(nextReminderAt(on(25), at(2026, 11, 27), never)).toEqual(new Date(2026, 11, 25, 9));
    expect(nextReminderAt(on(25), at(2026, 11, 25, 10), never)).toEqual(new Date(2026, 11, 25, 9));
    expect(nextReminderAt(on(25), at(2026, 11, 25, 8), never)).toEqual(new Date(2026, 10, 25, 9));
  });
  it("skips a month the donor already gave in", () => {
    const gave = gaveInMonth([new Date(2026, 10, 3)]);
    expect(nextReminderAt(on(25), at(2026, 11, 10), gave)).toEqual(new Date(2026, 11, 25, 9));
  });
  it("skips the month the donor said Not this month to, and only that month", () => {
    expect(nextReminderAt(on(25, { skipMonth: "2026-11" }), at(2026, 11, 10), never)).toEqual(new Date(2026, 11, 25, 9));
    expect(nextReminderAt(on(25, { skipMonth: "2026-10" }), at(2026, 11, 10), never)).toEqual(new Date(2026, 10, 25, 9));
  });
  it("the last day of the month, in a short February and a leap year, and across the year end", () => {
    expect(nextReminderAt(on("last"), at(2027, 2, 3), never)).toEqual(new Date(2027, 1, 28, 9));
    expect(nextReminderAt(on("last"), at(2028, 2, 3), never)).toEqual(new Date(2028, 1, 29, 9));
    expect(nextReminderAt(on("last"), at(2026, 12, 31, 10), never)).toEqual(new Date(2027, 0, 31, 9));
    expect(nextReminderAt(on(1), at(2026, 12, 15), never)).toEqual(new Date(2027, 0, 1, 9));
  });
  it("none when the reminder is off", () => {
    expect(nextReminderAt(NO_REMINDER, at(2026, 11, 10), never)).toBeNull();
    expect(nextReminderAt({ ...NO_REMINDER, day: 25 }, at(2026, 11, 10), never)).toBeNull();
  });
});

describe("the words", () => {
  it("are the approved ones, for each day", () => {
    expect(reminderMessage(25).body).toBe("It's the 25th. Your charities are a tap away, if you'd like to give this month.");
    expect(reminderMessage(1).body).toBe("It's the 1st. Your charities are a tap away, if you'd like to give this month.");
    expect(reminderMessage("last").body).toBe("It's the last day of the month. Your charities are a tap away, if you'd like to give this month.");
  });
  it("the button names the outcome, never 'Allow'", () => {
    expect(remindButton(25)).toBe("Remind me on the 25th");
    expect(remindButton("last")).toBe("Remind me on the last day");
    for (const d of [1, 15, 20, 25, "last"] as const) expect(remindButton(d)).not.toMatch(/allow|notification/i);
  });
  it("the summary in Account, with the next date as dd/mm/yyyy", () => {
    expect(reminderSummary(on(25), new Date(2026, 11, 25, 9))).toBe("On the 25th of each month. Next: 25/12/2026.");
    expect(reminderSummary(on("last"), null)).toBe("On the last day of each month.");
    expect(reminderSummary(NO_REMINDER, null)).toBeNull();
    expect(ddmmyyyy(new Date(2027, 0, 1))).toBe("01/01/2027");
  });
  it("never uses guilt words", () => {
    const all = [reminderMessage(25).body, reminderMessage("last").body, remindButton(15)].join(" ");
    expect(all).not.toMatch(/should|must|don't forget|missed|!/i);
  });
});

describe("settings read back from the phone", () => {
  it("anything odd becomes no reminder, never a crash", () => {
    for (const raw of [null, "x", 5, [], { on: true }, { on: true, day: 31 }, { on: "yes", day: 25 }]) {
      expect(cleanSettings(raw).on).toBe(false);
    }
  });
  it("keeps good settings, and drops a malformed date", () => {
    expect(cleanSettings({ on: true, day: "last", askedAt: "2026-11-27T08:00:00Z", skipMonth: "2026-12" })).toEqual({ on: true, day: "last", askedAt: "2026-11-27T08:00:00Z", skipMonth: "2026-12" });
    expect(cleanSettings({ on: true, day: 25, askedAt: "yesterday", skipMonth: "Dec" })).toEqual({ on: true, day: 25, askedAt: null, skipMonth: null });
  });
});
