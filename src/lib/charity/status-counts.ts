import { statusLabels, type CharityStatus } from "./status";

type CountQuery = PromiseLike<{ count: number | null; error: { message: string } | null }>;
type Client = { from: (table: "charities") => { select: (cols: string, opts: { head: true; count: "exact" }) => { eq: (col: "status", value: string) => CountQuery } } };

/**
 * How many charities are in each status: one exact count per status. Reading the rows and counting them stopped at the
 * database's 1 000-row limit, so the overview went wrong past 1 000 charities (review 23/11/2026).
 */
export async function countCharitiesByStatus(db: { from: (table: "charities") => unknown }): Promise<Map<CharityStatus, number>> {
  const supabase = db as Client;
  const statuses = Object.keys(statusLabels) as CharityStatus[];
  const results = await Promise.all(statuses.map((s) => supabase.from("charities").select("id", { head: true, count: "exact" }).eq("status", s)));
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  return new Map(statuses.map((s, i) => [s, results[i].count ?? 0]));
}
