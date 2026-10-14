/**
 * Reading or saving a personal record can fail. These results say so, so a
 * failed read is never mistaken for "nothing saved yet" and a failed save is
 * never shown as saved.
 *
 *   unreadable  the phone's secure storage could not be read right now (try again)
 *   corrupt     something is stored but it is not a valid record
 */
export type LoadResult<T> = { ok: true; value: T } | { ok: false; reason: "unreadable" | "corrupt" };
export type SaveResult = { ok: true } | { ok: false };
