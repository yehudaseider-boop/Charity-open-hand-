import type { SupabaseClient } from "@supabase/supabase-js";
import { readPages } from "./paged";

/**
 * The public charities list (app/charities/view.tsx), read in pages of 1 000: the database answers at most 1 000 rows
 * at a time and drops the rest without an error (review 23/11/2026), so a long list lost every charity after the
 * thousandth, by name. Public data only, read as an anonymous visitor (row-level security returns approved charities).
 */

export const PUBLIC_LIST_COLUMNS =
  "id, slug, name_en, description_en, logo_path, cover_path, suburb, city, is_verified, is_s18a, mandate_signed_at, charity_categories(category_id)";


/**
 * Approved charities by name, optionally matching a search pattern (searchPattern in app/charities/view.tsx) and in one cause.
 * The cause is matched on the charity's own categories, read with it, rather than a list of ids in the request:
 * a cause with thousands of charities would make that request too long.
 */
export async function readPublicCharities<T extends { id: string; charity_categories: { category_id: string }[] }>(
  db: SupabaseClient,
  { pattern, categoryId, causeIds = [] }: { pattern: string | null; categoryId: string | null; causeIds?: readonly string[] },
): Promise<T[]> {
  const read = (withPattern: boolean) =>
    readPages<T>((from, to) => {
      let q = db.from("charities").select(PUBLIC_LIST_COLUMNS).eq("status", "approved");
      // search_text is the name, legal name, description, suburb and city in lower case without accents (migration
      // 20261121000001). cleanQuery has already removed quotes, commas, % and _, so the only wildcards are ours.
      if (withPattern && pattern) q = q.like("search_text", pattern);
      // By name, then id: a stable order that ends in a unique column, so no charity is skipped or shown twice between pages.
      return q.order("name_en").order("id").range(from, to);
    });
  let rows: T[];
  if (pattern && causeIds.length) {
    // The search also names a cause ("food", "welfare", 26/11/2026: a donor searching by cause found nothing, though
    // the box says "Name, cause or area"): charities whose text matches, and charities in the causes it names.
    const [byText, every] = await Promise.all([read(true), read(false)]);
    const matched = new Set(byText.map((c) => c.id));
    rows = every.filter((c) => matched.has(c.id) || c.charity_categories.some((cc) => causeIds.includes(cc.category_id)));
  } else {
    rows = await read(true);
  }
  return categoryId ? rows.filter((c) => c.charity_categories.some((cc) => cc.category_id === categoryId)) : rows;
}
