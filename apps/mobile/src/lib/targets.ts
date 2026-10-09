import type { Target } from "@/components/target-editor";
import { secureStorage } from "./secure-storage";

/** The donor's maaser and chomesh targets, kept on this phone only. */
const KEY = "nediv-lev.maaser-target";

export async function loadTarget(): Promise<Target | null> {
  try {
    const raw = await secureStorage.getItem(KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as Target;
    const okCents = (v: unknown) => Number.isSafeInteger(v) && (v as number) > 0;
    if ((t.period === "month" || t.period === "year") && okCents(t.maaserCents) && (t.chomeshCents === null || okCents(t.chomeshCents))) return t;
    return null;
  } catch {
    return null;
  }
}

export async function saveTarget(t: Target): Promise<void> {
  try {
    await secureStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    // Not saved: the targets still work until the app is closed.
  }
}
