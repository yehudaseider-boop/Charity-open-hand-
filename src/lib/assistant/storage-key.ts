/**
 * The saved chat's key. It names whether Givy could see donors' names, so a chat kept while it could is never read
 * back (and sent again) once that switch is off (review 24/11/2026).
 */
export function storageKey(charityId: string | undefined, demo: boolean, who: string | undefined, names = false) {
  return `givezy.helper.${demo ? "demo" : `${charityId}.${who ?? "anon"}${names ? ".names" : ""}`}`;
}
