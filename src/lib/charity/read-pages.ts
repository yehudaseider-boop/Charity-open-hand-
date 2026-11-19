/** Rows per request: the database's API gives at most 1 000 at a time. */
export const PAGE = 1000;

type Page<T> = { data: T[] | null; error: { message: string } | null; count?: number | null };

/**
 * Every row a query gives, 1 000 at a time, in the query's order. The first request also asks how many rows there
 * are; the rest are then asked for a few at a time side by side, instead of one after another (19/11/2026: the
 * dashboard's report read a big charity's 20 000 gifts in 20 trips in a row and took over a minute). If rows were
 * added while reading, it keeps reading past the count until a short page, as a one-by-one read would.
 *
 * `page(from, to, count)` reads rows `from` to `to` (inclusive); when `count` is true it also returns the total.
 */
export async function readAllPages<T>(page: (from: number, to: number, count: boolean) => PromiseLike<Page<T>>, sideBySide = 4): Promise<T[]> {
  const first = await page(0, PAGE - 1, true);
  if (first.error) throw new Error(first.error.message);
  const rows = [...(first.data ?? [])];
  if (rows.length < PAGE) return rows;

  const starts: number[] = [];
  for (let from = PAGE; from < (first.count ?? 0); from += PAGE) starts.push(from);
  const pages: T[][] = new Array(starts.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(sideBySide, starts.length) }, async () => {
      while (next < starts.length) {
        const i = next++;
        const r = await page(starts[i], starts[i] + PAGE - 1, false);
        if (r.error) throw new Error(r.error.message);
        pages[i] = r.data ?? [];
      }
    }),
  );
  for (const p of pages) rows.push(...p);

  // Past the count (or no count given): one by one until a page comes back short.
  let last = pages.length ? pages[pages.length - 1] : first.data ?? [];
  for (let from = PAGE * (starts.length + 1); last.length === PAGE; from += PAGE) {
    const r = await page(from, from + PAGE - 1, false);
    if (r.error) throw new Error(r.error.message);
    last = r.data ?? [];
    rows.push(...last);
  }
  return rows;
}
