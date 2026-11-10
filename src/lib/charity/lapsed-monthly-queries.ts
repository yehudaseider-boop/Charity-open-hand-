import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Period } from "./dashboard";
import { lapsedReason, type LapsedRow } from "./lapsed-monthly";

/**
 * Monthly donors who stopped in a period, newest first, read as the signed-in person through
 * `charity_lapsed_monthly` (which checks they manage this charity). Read page by page: the database
 * answers at most 1 000 rows at a time.
 */
export async function loadLapsedMonthly(charityId: string, period: Period): Promise<LapsedRow[]> {
  const supabase = await createClient();
  const rows: LapsedRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .rpc("charity_lapsed_monthly", { p_charity_id: charityId, p_from: period.from, p_to: period.to })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as LapsedRow[]));
    if (!data || data.length < 1000) break;
  }
  return rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents ?? 0), reason: lapsedReason(r.reason) }));
}
