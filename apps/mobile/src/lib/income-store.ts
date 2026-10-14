import { cleanIncome, type IncomeEntry } from "./ledger";
import { loadOwned, saveOwned } from "./owned-storage";
import type { LoadResult, SaveResult } from "./stored-result";

/**
 * Income entries stay on this phone only (its secure storage). Income is
 * the most sensitive thing in the app, so it never goes to our servers.
 * Each signed-in person has their own log (see owned-storage).
 *
 * A failed read is reported as a failure, never as an empty log: the screen
 * must not save over a log it could not read.
 */
const KEY = "nediv-lev.income-log";
const BACKUP_KEY = `${KEY}.set-aside`;

export async function loadIncome(userId: string | null): Promise<LoadResult<IncomeEntry[]>> {
  let raw: string | null;
  try {
    raw = await loadOwned(KEY, userId);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (raw === null) return { ok: true, value: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { ok: false, reason: "corrupt" };
    return { ok: true, value: cleanIncome(parsed) };
  } catch {
    return { ok: false, reason: "corrupt" };
  }
}

export async function saveIncome(entries: IncomeEntry[], userId: string | null): Promise<SaveResult> {
  try {
    await saveOwned(KEY, userId, JSON.stringify(entries));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * The person's explicit choice after a log turned out to be unreadable text:
 * keep the old text aside, then start a new empty log. If the old text cannot
 * be kept aside, nothing is replaced.
 */
export async function startNewIncomeLog(userId: string | null): Promise<SaveResult> {
  try {
    const old = await loadOwned(KEY, userId);
    if (old !== null) await saveOwned(BACKUP_KEY, userId, old);
    await saveOwned(KEY, userId, "[]");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
