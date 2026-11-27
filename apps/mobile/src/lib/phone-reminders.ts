import { Linking, Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import type * as NotificationsModule from "expo-notifications";
import { reminderMessage, type ReminderDay } from "./reminders";

/**
 * The phone's side of the payday reminder (27/11/2026): asking permission, setting the one reminder, and hearing when
 * the donor taps it. A reminder set on the phone itself (a local notification): no push server, no push keys, nothing
 * about the donor leaves the phone.
 *
 * Safe on every build: an app built before notifications were added (an over-the-air update reaches it too) has no
 * notification parts, and the web has none. Then `remindersAvailable()` is false and the app simply doesn't offer the
 * reminder; nothing here ever throws for that reason.
 */

type Notifications = typeof NotificationsModule;
let loaded: Notifications | null | undefined;

function notifications(): Notifications | null {
  if (loaded !== undefined) return loaded;
  loaded = null;
  if (Platform.OS === "web") return loaded;
  // Both parts this uses must be in this build before the module is loaded at all (loading it without them throws).
  if (!requireOptionalNativeModule("ExpoNotificationScheduler") || !requireOptionalNativeModule("ExpoNotificationPermissionsModule")) return loaded;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require("expo-notifications") as Notifications;
  } catch {
    loaded = null;
  }
  return loaded;
}

/** Whether this phone and this build can set a reminder at all. */
export const remindersAvailable = (): boolean => notifications() !== null;

/** Whether the phone lets Givezy show the reminder. "unavailable": this build or the web can't. */
export type ReminderPermission = "granted" | "denied" | "undetermined" | "unavailable";

const ANDROID_CHANNEL = "monthly-reminder";
/** The one reminder's own id, so setting it again replaces it: never two. */
const REMINDER_ID = "givezy-payday-reminder";
/** Where tapping it goes. */
export const REMINDER_OPENS = "/give-this-month";

function asPermission(p: { granted: boolean; canAskAgain: boolean; status: string }): ReminderPermission {
  if (p.granted) return "granted";
  return p.status === "undetermined" || (p.canAskAgain && p.status !== "denied") ? "undetermined" : "denied";
}

export async function reminderPermission(): Promise<ReminderPermission> {
  const n = notifications();
  if (!n) return "unavailable";
  try {
    return asPermission(await n.getPermissionsAsync());
  } catch {
    return "unavailable";
  }
}

/**
 * The phone's own question. Only ever called from the donor's "Remind me on the 25th" press, after they chose a day
 * and saw the reminder's words (the ask comes after the outcome, 27/11/2026). Asking when the phone already said no
 * shows nothing: the answer stays "denied".
 */
export async function askForReminders(): Promise<ReminderPermission> {
  const n = notifications();
  if (!n) return "unavailable";
  try {
    if (Platform.OS === "android") await n.setNotificationChannelAsync(ANDROID_CHANNEL, { name: "Monthly reminder", importance: n.AndroidImportance.DEFAULT });
    return asPermission(await n.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }));
  } catch {
    return "unavailable";
  }
}

/** Sets the one reminder for this moment (replacing any earlier one). False when the phone wouldn't set it. */
export async function setReminder(at: Date, day: ReminderDay): Promise<boolean> {
  const n = notifications();
  if (!n) return false;
  try {
    await n.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => undefined);
    const { title, body } = reminderMessage(day);
    await n.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: { title, body, data: { opens: REMINDER_OPENS } },
      trigger: { type: n.SchedulableTriggerInputTypes.DATE, date: at, ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL } : {}) },
    });
    return true;
  } catch {
    return false;
  }
}

/** Takes the reminder off the phone. Safe to call when none is set. */
export async function clearReminder(): Promise<void> {
  const n = notifications();
  if (!n) return;
  await n.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => undefined);
}

/**
 * Calls `open` with where to go when the donor taps the reminder: now (the app was opened by the tap) and from then on.
 * Returns the way to stop listening.
 */
export function onReminderTapped(open: (path: string) => void): () => void {
  const n = notifications();
  if (!n) return () => undefined;
  const handle = (r: { notification: { request: { identifier: string; content: { data?: Record<string, unknown> | null } } } } | null) => {
    if (!r || r.notification.request.identifier !== REMINDER_ID) return;
    const to = r.notification.request.content.data?.opens;
    open(typeof to === "string" && to.startsWith("/") ? to : REMINDER_OPENS);
  };
  try {
    // If the app is open at 09:00, the reminder still shows as a banner (never a sound-less miss).
    n.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
    const last = n.getLastNotificationResponse();
    if (last) {
      handle(last);
      n.clearLastNotificationResponse();
    }
    const sub = n.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}

/** The phone's own Settings for Givezy, where a "no" to reminders can be changed. */
export const openPhoneSettings = () => Linking.openSettings().catch(() => undefined);
