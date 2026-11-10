import "server-only";
import { createClient } from "@/lib/supabase/server";
import { toKeepingRow, toKeepingSummary, type KeepingRow, type KeepingSummary, type KeepingWindow } from "./keeping-donors";

/** The database function isn't there yet (its migration hasn't run on this database). */
export class KeepingNotSetUp extends Error {}

/** "Function not found" from the database or the API in front of it. */
export function isMissingFunction(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message ?? "");
}

/**
 * Last tax year's and earlier donors for the chosen year, read as the signed-in person through
 * `charity_keeping_donors` (which checks they manage this charity). Read page by page: the database answers at
 * most 1 000 rows at a time. Throws KeepingNotSetUp when the function doesn't exist yet.
 */
type Bounds = Pick<KeepingWindow, "lastFrom" | "thisFrom" | "thisTo" | "now">;
const args = (charityId: string, w: Bounds) => ({ p_charity_id: charityId, p_last_from: w.lastFrom, p_this_from: w.thisFrom, p_this_to: w.thisTo, p_now: w.now });

export async function loadKeepingDonors(charityId: string, w: Bounds): Promise<KeepingRow[]> {
  const supabase = await createClient();
  const rows: KeepingRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .rpc("charity_keeping_donors", args(charityId, w))
      .range(from, from + 999);
    if (error) {
      if (isMissingFunction(error)) throw new KeepingNotSetUp("charity_keeping_donors is not set up");
      throw new Error(error.message);
    }
    rows.push(...((data ?? []) as Record<string, unknown>[]).map(toKeepingRow));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

/**
 * The counts only, for the overview's card: one row from `charity_keeping_summary`, one query, no lists.
 * Throws KeepingNotSetUp when the function doesn't exist yet.
 */
export async function loadKeepingSummary(charityId: string, w: Bounds): Promise<KeepingSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("charity_keeping_summary", args(charityId, w));
  if (error) {
    if (isMissingFunction(error)) throw new KeepingNotSetUp("charity_keeping_summary is not set up");
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  return toKeepingSummary((row ?? null) as Record<string, unknown> | null);
}
