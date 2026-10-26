/**
 * A tiny signal for personal records kept on the phone (goals, income). A screen that saves one calls
 * `recordsChanged()`, and every other open screen reading records loads them again, so Home never shows an old
 * goal after Progress changed it, and never saves over a newer one.
 */
const listeners = new Set<() => void>();

export function recordsChanged(): void {
  for (const f of listeners) f();
}

export function onRecordsChanged(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
