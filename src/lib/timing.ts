import "server-only";

/**
 * Where a slow dashboard page spends its time (23/11/2026, Yehuda: "make the donor list faster still"). Each wrapped
 * read is timed, and only a slow one is written to the server log, as "[timing] donors loadDonors 412 ms", so the
 * speed check's runs show which read to fix. Nothing about a donor or a charity is logged: the page, the read and the
 * time only. Remove a page's timings once it is fast.
 */
export const SLOW_READ_MS = 250;

export async function timed<T>(page: string, read: string, work: PromiseLike<T>): Promise<T> {
  const started = performance.now();
  try {
    return await work;
  } finally {
    const ms = Math.round(performance.now() - started);
    if (ms >= SLOW_READ_MS) console.info(`[timing] ${page} ${read} ${ms} ms`);
  }
}
