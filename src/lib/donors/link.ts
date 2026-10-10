import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * After someone signs in with the emailed link (which proves they control the
 * address), attach the donor identities that used that address, so they can see
 * their donations and receipts. Only donors with no account yet are linked.
 */
export async function linkDonorsToUser(userId: string, email: string): Promise<number> {
  const { data, error } = await createAdminClient().rpc("link_donors_to_user", { p_user: userId, p_email: email });
  if (error) throw new Error(`Could not link donors: ${error.message}`);
  return Number(data ?? 0);
}
