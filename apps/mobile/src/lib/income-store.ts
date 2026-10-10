import { cleanIncome, type IncomeEntry } from "./ledger";
import { loadOwned, saveOwned } from "./owned-storage";

/**
 * Income entries stay on this phone only (its secure storage). Income is
 * the most sensitive thing in the app, so it never goes to our servers.
 * Each signed-in person has their own log (see owned-storage).
 */
const KEY = "nediv-lev.income-log";

export async function loadIncome(userId: string | null): Promise<IncomeEntry[]> {
  try {
    const raw = await loadOwned(KEY, userId);
    return raw ? cleanIncome(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export async function saveIncome(entries: IncomeEntry[], userId: string | null): Promise<void> {
  try {
    await saveOwned(KEY, userId, JSON.stringify(entries));
  } catch {
    // Not saved: the entries still show until the app is closed.
  }
}
