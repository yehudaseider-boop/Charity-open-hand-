import { secureStorage } from "./secure-storage";

/** Whether this phone has seen the first-open welcome. Kept on the phone only. */
const KEY = "nediv-lev.welcomed";

export async function hasBeenWelcomed(): Promise<boolean> {
  try {
    return (await secureStorage.getItem(KEY)) === "1";
  } catch {
    return false;
  }
}

export async function markWelcomed(): Promise<void> {
  try {
    await secureStorage.setItem(KEY, "1");
  } catch {
    // Not saved: the welcome shows again next time, which is harmless.
  }
}
