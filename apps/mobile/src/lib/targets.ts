import type { Target } from "./target-type";
import { loadOwned, saveOwned } from "./owned-storage";
import type { LoadResult, SaveResult } from "./stored-result";

/** The donor's maaser and chomesh targets, kept on this phone only, one set per person. */
const KEY = "nediv-lev.maaser-target";
const BACKUP_KEY = `${KEY}.set-aside`;

const okCents = (v: unknown) => Number.isSafeInteger(v) && (v as number) > 0;
const isTarget = (t: Target): boolean =>
  (t.period === "month" || t.period === "year") && okCents(t.maaserCents) && (t.chomeshCents === null || okCents(t.chomeshCents));

/** No target saved yet is `{ ok: true, value: null }`; a failed or invalid read is a failure. */
export async function loadTarget(userId: string | null): Promise<LoadResult<Target | null>> {
  let raw: string | null;
  try {
    raw = await loadOwned(KEY, userId);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (raw === null) return { ok: true, value: null };
  try {
    const t = JSON.parse(raw) as Target | null;
    if (t === null) return { ok: true, value: null }; // set aside earlier: no target
    return typeof t === "object" && isTarget(t) ? { ok: true, value: t } : { ok: false, reason: "corrupt" };
  } catch {
    return { ok: false, reason: "corrupt" };
  }
}

export async function saveTarget(t: Target, userId: string | null): Promise<SaveResult> {
  try {
    await saveOwned(KEY, userId, JSON.stringify(t));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** After an invalid stored target: keep the old text aside so the person can set a new one. */
export async function setAsideTarget(userId: string | null): Promise<SaveResult> {
  try {
    const old = await loadOwned(KEY, userId);
    if (old !== null) await saveOwned(BACKUP_KEY, userId, old);
    await saveOwned(KEY, userId, "null");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
