import { secureStorage } from "./secure-storage";

/** The causes the donor picked when they first opened the app, for "Your causes" on Home. Phone only. */
const KEY = "nediv-lev.causes";

export async function loadCausePrefs(): Promise<string[]> {
  try {
    const raw = await secureStorage.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 20) : [];
  } catch {
    return [];
  }
}

export async function saveCausePrefs(ids: string[]): Promise<void> {
  try {
    await secureStorage.setItem(KEY, JSON.stringify(ids.slice(0, 20)));
  } catch {
    // Not saved: Home shows a general mix instead.
  }
}
