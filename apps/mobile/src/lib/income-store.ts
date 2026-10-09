import { cleanIncome, type IncomeEntry } from "./ledger";
import { secureStorage } from "./secure-storage";

/**
 * Income entries stay on this phone only (its secure storage). Income is
 * the most sensitive thing in the app, so it never goes to our servers.
 * Deleting the app deletes them.
 */
const KEY = "nediv-lev.income-log";

export async function loadIncome(): Promise<IncomeEntry[]> {
  try {
    const raw = await secureStorage.getItem(KEY);
    return raw ? cleanIncome(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export async function saveIncome(entries: IncomeEntry[]): Promise<void> {
  try {
    await secureStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // Not saved: the entries still show until the app is closed.
  }
}
