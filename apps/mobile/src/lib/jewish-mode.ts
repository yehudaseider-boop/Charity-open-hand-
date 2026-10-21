import { useSyncExternalStore } from "react";
import { secureStorage } from "./secure-storage";

/**
 * "Jewish calendar and maaser": off by default, so the app is for everyone. On, it brings back the
 * Hebrew date, the Shabbos and Yom Tov greetings and prompts, Hebrew charity names, and maaser,
 * chomesh and tzedaka as ready-made labels. Kept on this phone only and never sent to our server:
 * it says something about the person's religion (special personal information under POPIA).
 */
const KEY = "nediv-lev.jewish-mode";
let on = false;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load() {
  if (loaded) return;
  loaded = true;
  secureStorage.getItem(KEY).then(
    (v) => {
      if ((v === "on") !== on) {
        on = v === "on";
        emit();
      }
    },
    () => undefined,
  );
}

export function setJewishMode(next: boolean) {
  on = next;
  emit();
  void secureStorage.setItem(KEY, next ? "on" : "off").catch(() => undefined);
}

export function useJewishMode(): boolean {
  load();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => on,
    () => on,
  );
}
