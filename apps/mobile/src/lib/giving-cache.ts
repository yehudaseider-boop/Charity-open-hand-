import { secureStorage } from "./secure-storage";

/**
 * The phone keeps a copy of the signed-in person's giving so it can show it
 * offline. It must not outlive the sign-in: it is removed when they sign out,
 * whether they chose to or the session simply ended. A pointer to whose copy
 * it is lets that happen even after the app has been restarted.
 */
export const cacheKey = (userId: string) => `nediv-lev.giving.${userId}`;
const OWNER_KEY = "nediv-lev.giving.owner";

/** Save the copy and note whose it is. */
export async function writeGivingCache(userId: string, value: string): Promise<void> {
  await secureStorage.setItem(cacheKey(userId), value);
  await secureStorage.setItem(OWNER_KEY, userId);
}

/** Remove the copy (and the note) for this person, or for whoever last had one. */
export async function forgetGivingCache(userId?: string | null): Promise<void> {
  const owner = await secureStorage.getItem(OWNER_KEY).catch(() => null);
  for (const id of new Set([userId, owner])) {
    if (id) await secureStorage.removeItem(cacheKey(id)).catch(() => undefined);
  }
  await secureStorage.removeItem(OWNER_KEY).catch(() => undefined);
}
