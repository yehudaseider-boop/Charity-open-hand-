import { loadOwned, saveOwned } from "./owned-storage";
import { cleanRemembered, type RememberedDetails } from "./pay-api";

/**
 * "Remember my details on this phone": name, email and phone only, in the phone's secure
 * storage, per signed-in person. Off unless the donor turns it on. ID and tax numbers are never kept.
 */
const KEY = "nediv-lev.donor-details";

export async function loadDetails(userId: string | null): Promise<RememberedDetails | null> {
  try {
    // Never the details remembered while signed out: on a shared phone they may be someone else's.
    const raw = await loadOwned(KEY, userId, { adoptShared: false });
    return raw ? cleanRemembered(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function saveDetails(userId: string | null, d: RememberedDetails): Promise<void> {
  await saveOwned(KEY, userId, JSON.stringify(d)).catch(() => {});
}

export async function forgetDetails(userId: string | null): Promise<void> {
  await saveOwned(KEY, userId, "null").catch(() => {});
}
