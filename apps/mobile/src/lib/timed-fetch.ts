/**
 * fetch with a time limit, for the database client (bad-signal test of 18/11/2026). On a weak mobile signal a request
 * can stall instead of failing; without a limit, the charity page, Discover, Progress and sign-in showed their loading
 * shapes for ever, with no message. With it, a stalled request fails like a lost connection, and each screen's own
 * "couldn't load, Try again" (or "check your connection") appears. A caller's own cancel still works.
 */
export const DB_TIME_LIMIT_MS = 20_000;

/** The error a timed-out request fails with: an "AbortError", so it isn't retried, with plain words. */
export function timedOut(): Error {
  const e = new Error("The connection timed out.");
  e.name = "AbortError";
  return e;
}

export function timedFetch(limitMs: number = DB_TIME_LIMIT_MS, base: typeof fetch = fetch): typeof fetch {
  return (input, init = {}) => {
    const stop = new AbortController();
    // Named like a cancel, so the database library doesn't quietly try 3 more times (4 x the wait) before saying so.
    const timer = setTimeout(() => stop.abort(timedOut()), limitMs);
    const theirs = init.signal;
    if (theirs) {
      if (theirs.aborted) stop.abort(theirs.reason);
      else theirs.addEventListener("abort", () => stop.abort(theirs.reason), { once: true });
    }
    return base(input, { ...init, signal: stop.signal }).finally(() => clearTimeout(timer));
  };
}
