import { cleanGoals, goalsFromOldTarget, type Goal } from "./goals";
import { loadOwned, saveOwned } from "./owned-storage";
import { recordsChanged } from "./record-changes";
import type { LoadResult, SaveResult } from "./stored-result";
import { loadTarget } from "./targets";

/**
 * The donor's giving goals, on this phone only (one set per person, see owned-storage). Someone
 * who set maaser targets in an earlier version sees them here as goals; the old record is kept.
 * A failed read is a failure, never "no goals": the screen must not save over what it can't read.
 */
const KEY = "nediv-lev.giving-goals";
const BACKUP_KEY = `${KEY}.set-aside`;

export async function loadGoals(userId: string | null): Promise<LoadResult<Goal[]>> {
  let raw: string | null;
  try {
    raw = await loadOwned(KEY, userId);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (raw === null) {
    const old = await loadTarget(userId);
    return old.ok ? { ok: true, value: goalsFromOldTarget(old.value) } : old;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { ok: false, reason: "corrupt" };
    return { ok: true, value: cleanGoals(parsed) };
  } catch {
    return { ok: false, reason: "corrupt" };
  }
}

export async function saveGoals(goals: Goal[], userId: string | null): Promise<SaveResult> {
  try {
    await saveOwned(KEY, userId, JSON.stringify(goals));
    recordsChanged();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** After an unreadable record: keep the old text aside so the person can set new goals. */
export async function setAsideGoals(userId: string | null): Promise<SaveResult> {
  try {
    const old = await loadOwned(KEY, userId);
    if (old !== null) await saveOwned(BACKUP_KEY, userId, old);
    await saveOwned(KEY, userId, "[]");
    recordsChanged();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
