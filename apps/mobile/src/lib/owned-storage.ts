import { secureStorage } from "./secure-storage";

/**
 * Personal records kept on the phone (income log, maaser targets) belong to
 * the person, not the phone: each signed-in person has their own copy, so on
 * a shared phone nobody sees anyone else's.
 *
 * Signed out, they're kept for "whoever uses this phone". The first person to
 * sign in who has nothing of their own yet takes that copy over (so someone
 * who set things up before signing in doesn't lose them), and it's then gone
 * from the shared slot.
 */
const keyFor = (base: string, userId: string | null) => (userId ? `${base}.u.${userId}` : base);

export async function loadOwned(base: string, userId: string | null): Promise<string | null> {
  const own = await secureStorage.getItem(keyFor(base, userId));
  if (own !== null || !userId) return own;
  const shared = await secureStorage.getItem(base);
  if (shared === null) return null;
  await secureStorage.setItem(keyFor(base, userId), shared);
  await secureStorage.removeItem(base);
  return shared;
}

export function saveOwned(base: string, userId: string | null, value: string): Promise<void> {
  return secureStorage.setItem(keyFor(base, userId), value);
}
