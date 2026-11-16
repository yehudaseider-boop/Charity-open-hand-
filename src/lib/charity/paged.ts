/**
 * The database answers at most 1 000 rows at a time (max_rows in supabase/config.toml): anything past that is
 * dropped without an error. A read that decides who is emailed, stopped or counted must therefore read page by page
 * (review 12/11/2026). Dependency-free, so it can be tested with a stand-in for the database.
 */

export const PAGE_ROWS = 1000;

type Page = PromiseLike<{ data: unknown[] | null; error: unknown }>;

/**
 * Every row of a query, page by page. `page(from, to)` builds the query for rows `from` to `to` (inclusive, as
 * `.range` takes them); it must have a stable order that ends in a unique column (`.order("id")`), or rows can be
 * skipped or repeated between pages.
 */
export async function readPages<T>(page: (from: number, to: number) => Page): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_ROWS) break;
  }
  return out;
}
