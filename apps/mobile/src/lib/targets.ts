import type { Target } from "@/components/target-editor";
import { loadOwned, saveOwned } from "./owned-storage";

/** The donor's maaser and chomesh targets, kept on this phone only, one set per person. */
const KEY = "nediv-lev.maaser-target";

export async function loadTarget(userId: string | null): Promise<Target | null> {
  try {
    const raw = await loadOwned(KEY, userId);
    if (!raw) return null;
    const t = JSON.parse(raw) as Target;
    const okCents = (v: unknown) => Number.isSafeInteger(v) && (v as number) > 0;
    if ((t.period === "month" || t.period === "year") && okCents(t.maaserCents) && (t.chomeshCents === null || okCents(t.chomeshCents))) return t;
    return null;
  } catch {
    return null;
  }
}

export async function saveTarget(t: Target, userId: string | null): Promise<void> {
  try {
    await saveOwned(KEY, userId, JSON.stringify(t));
  } catch {
    // Not saved: the targets still work until the app is closed.
  }
}
