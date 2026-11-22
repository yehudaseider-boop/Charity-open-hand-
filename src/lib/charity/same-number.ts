import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrationKey } from "@/lib/charity/vetting";

export type SameNumberCharity = { id: string; name: string; status: string };

/**
 * Other charities listed under the same NPO or PBO number as this one: a copy, a typo, or someone borrowing a real
 * charity's number (18/11/2026). Compared without spaces, dashes or slashes and in any case, so "930 012 345" and
 * "930012345" count as the same number. Shared by the Admin page (the warning) and approving (which then needs a
 * written reason, 22/11/2026). Server only (service role): call after checking the caller is a Givezy admin.
 */
export async function charitiesWithSameNumber(charity: { id: string; npo_number: string | null; pbo_number: string | null }): Promise<SameNumberCharity[]> {
  const mine = [charity.npo_number, charity.pbo_number].map(registrationKey).filter(Boolean);
  if (!mine.length) return [];
  const db = createAdminClient();
  const found: SameNumberCharity[] = [];
  // Page by page: the database hands out at most 1 000 rows at a time.
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await db.from("charities").select("id, name_en, status, npo_number, pbo_number").neq("id", charity.id).order("id").range(from, from + 999);
    if (error) throw error;
    for (const o of data ?? []) {
      const theirs = [o.npo_number, o.pbo_number].map(registrationKey).filter(Boolean);
      if (theirs.some((n) => mine.includes(n))) found.push({ id: o.id as string, name: o.name_en as string, status: o.status as string });
    }
    if (!data || data.length < 1000) break;
  }
  return found;
}
