import { useRouter } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { gifts as sampleGifts } from "@/data/giving";
import { useAccount } from "./account";
import { askForReminders, onReminderTapped, remindersAvailable } from "./phone-reminders";
import { loadReminder, saveReminder, syncReminder, type ReminderState } from "./reminder-store";
import { gaveInMonth, monthKeyOf, nextReminderAt, type ReminderDay, type ReminderSettings } from "./reminders";

/**
 * The payday reminder for every screen (27/11/2026). One place keeps the phone's reminder in step with the setting and
 * the donor's gifts: when the app opens, when it comes back to the front, whenever the gifts change (a gift this month
 * moves the reminder to next month), and after every change here. Tapping the reminder opens "Give this month".
 *
 * Every change says plainly what happened and can be undone where it can be (turning it off keeps the old setting
 * for Undo). The phone's own "no" is never asked about again by the app: the donor changes it in the phone's Settings.
 */

/** The answer to "Remind me on the 25th". */
export type StartResult = { ok: true; next: Date | null } | { ok: false; reason: "denied" | "unavailable" | "not-saved" | "failed" };

type ReminderValue = {
  /** False on the web and on an app build without notifications: no reminder is offered or shown. */
  available: boolean;
  /** Null until read from the phone. */
  settings: ReminderSettings | null;
  state: ReminderState;
  /** Offered once, after a first gift, until the donor chose: set one, or "Not now". */
  offerable: boolean;
  start(day: ReminderDay): Promise<StartResult>;
  notNow(): Promise<void>;
  /** Turns it off; the result is what Undo puts back. */
  turnOff(): Promise<ReminderSettings | null>;
  restore(previous: ReminderSettings): Promise<void>;
  /** "Not this month": the next one is next month's. */
  skipThisMonth(): Promise<Date | null>;
};

const ReminderContext = createContext<ReminderValue | null>(null);

export function useReminder(): ReminderValue {
  const v = useContext(ReminderContext);
  if (!v) throw new Error("useReminder needs ReminderProvider");
  return v;
}

/** Keeps the phone's reminder in step; in the web preview (sample mode) only works out the date, setting nothing. */
async function syncAny(sample: boolean, next: ReminderSettings, dates: readonly Date[]): Promise<ReminderState> {
  if (!sample) return syncReminder(next, dates);
  const at = nextReminderAt(next, new Date(), gaveInMonth(dates));
  return at ? { kind: "set", next: at } : { kind: "off" };
}

export function ReminderProvider({ children }: { children: React.ReactNode }) {
  const account = useAccount();
  const router = useRouter();
  // The web preview (sample mode) has no phone notifications: there the screens work as if the phone said yes, so the
  // journey can be seen and checked, and nothing is ever set.
  const sample = Platform.OS === "web" && account.status === "preview";
  const available = remindersAvailable() || sample;
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [state, setState] = useState<ReminderState>({ kind: "off" });
  // The sample donor's gifts in the preview (sample mode), the signed-in donor's otherwise.
  const gifts = account.status === "preview" ? sampleGifts : account.live?.gifts;
  const giftDates = useMemo(() => (gifts ?? []).map((g) => g.date), [gifts]);

  // The latest of each, for the app-comes-back check, which runs outside React's own updates.
  const latest = useRef({ settings, giftDates });
  useEffect(() => {
    latest.current = { settings, giftDates };
  }, [settings, giftDates]);

  useEffect(() => {
    let alive = true;
    void loadReminder().then((s) => {
      if (alive) setSettings(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  // In step with the setting and the gifts: after loading, after every change, and when the gifts change.
  useEffect(() => {
    if (!available || !settings) return;
    let alive = true;
    void syncAny(sample, settings, giftDates).then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, [available, settings, giftDates, sample]);

  // Back to the front (a new month may have started, or the donor changed the phone's Settings): check again.
  useEffect(() => {
    if (!available) return;
    const sub = AppState.addEventListener("change", (now) => {
      const { settings: s, giftDates: d } = latest.current;
      if (now === "active" && s) void syncAny(sample, s, d).then(setState);
    });
    return () => sub.remove();
  }, [available, sample]);

  // Tapping the reminder opens "Give this month" (also when the tap opened the app).
  useEffect(() => (available ? onReminderTapped((path) => router.push(path as never)) : undefined), [available, router]);

  const save = useCallback(async (next: ReminderSettings) => {
    const ok = await saveReminder(next);
    if (ok) setSettings(next);
    return ok;
  }, []);

  const value = useMemo<ReminderValue>(() => {
    const hasGiven = giftDates.length > 0;
    return {
      available,
      settings,
      state,
      offerable: available && settings !== null && !settings.on && settings.askedAt === null && hasGiven,
      async start(day) {
        if (!available) return { ok: false, reason: "unavailable" };
        const answer = sample ? "granted" : await askForReminders();
        const askedAt = new Date().toISOString();
        if (answer !== "granted") {
          // Remembered as asked, so the app never asks again by itself; the donor can still turn it on later.
          await save({ on: false, day, askedAt, skipMonth: null });
          return { ok: false, reason: answer === "unavailable" ? "unavailable" : "denied" };
        }
        const next: ReminderSettings = { on: true, day, askedAt, skipMonth: null };
        if (!(await save(next))) return { ok: false, reason: "not-saved" };
        const s = await syncAny(sample, next, giftDates);
        setState(s);
        return s.kind === "set" ? { ok: true, next: s.next } : s.kind === "off" ? { ok: true, next: null } : { ok: false, reason: "failed" };
      },
      async notNow() {
        await save({ ...(settings ?? { on: false, day: null, skipMonth: null }), on: false, askedAt: new Date().toISOString() });
      },
      async turnOff() {
        if (!settings?.on) return null;
        const previous = settings;
        await save({ ...settings, on: false });
        return previous;
      },
      async restore(previous) {
        await save(previous);
      },
      async skipThisMonth() {
        if (!settings?.on) return null;
        const next: ReminderSettings = { ...settings, skipMonth: monthKeyOf(new Date()) };
        await save(next);
        const s = await syncAny(sample, next, giftDates);
        setState(s);
        return s.kind === "set" ? s.next : null;
      },
    };
  }, [available, settings, state, giftDates, save, sample]);

  return <ReminderContext.Provider value={value}>{children}</ReminderContext.Provider>;
}
