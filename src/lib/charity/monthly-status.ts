import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { readAllPages } from "./read-pages";

/**
 * Which of a charity's donors give monthly ("active") or have paused it ("paused"), for the "Gives monthly" and
 * "Monthly paused" badges on the Donors list and the donor panel.
 *
 * Read straight from the monthly donations (26/11/2026): the Donors list used to read every monthly gift the charity
 * ever received (about 5 000 rows on the 3 000-donor test charity, page by page) plus the whole monthly list, only to
 * work out these two badges, and was the slowest dashboard page. One row per monthly donation answers the same: a
 * monthly donation is only "active" once its first payment is in ("pending" before that), and only an active one can
 * be paused.
 *
 * Charities don't read monthly donations themselves (they carry the payment provider's references), so this reads
 * with the service role and returns only the donor and the status. CALLERS MUST HAVE CHECKED that the signed-in person
 * manages this charity (loadCharityForManager) first.
 */
export async function loadMonthlyStatusByDonor(charityId: string, donorId?: string): Promise<Map<string, "active" | "paused">> {
  const db = createAdminClient();
  const rows = await readAllPages<{ id: string; donor_id: string; status: string }>((from, to, count) => {
    let q = db
      .from("recurring_donations")
      .select("id, donor_id, status", count ? { count: "exact" } : undefined)
      .eq("charity_id", charityId)
      .in("status", ["active", "paused"]);
    if (donorId) q = q.eq("donor_id", donorId);
    return q.order("id").range(from, to) as unknown as PromiseLike<{ data: { id: string; donor_id: string; status: string }[] | null; error: { message: string } | null; count?: number | null }>;
  });
  return monthlyStatusFrom(rows);
}

/** One badge per donor: "active" wins over "paused" when a donor has both. */
export function monthlyStatusFrom(rows: readonly { donor_id: string; status: string }[]): Map<string, "active" | "paused"> {
  const out = new Map<string, "active" | "paused">();
  for (const r of rows) {
    if (r.status === "active") out.set(r.donor_id, "active");
    else if (r.status === "paused" && out.get(r.donor_id) !== "active") out.set(r.donor_id, "paused");
  }
  return out;
}
