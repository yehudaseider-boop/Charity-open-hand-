import "server-only";
import { decrypt } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A signed-in donor's SA ID number from their last s18A gift, so they don't retype 13 digits.
 * Read on the server from the encrypted copy kept for that gift's receipt: the full number is
 * never sent to the browser or the phone, only its last four digits. Only for the person whose
 * account (confirmed by signing in with an emailed code) the earlier gifts belong to.
 */
async function latest(userId: string): Promise<{ encrypted: string; last4: string } | null> {
  const db = createAdminClient();
  const { data: donors } = await db.from("donors").select("id").eq("user_id", userId).eq("donor_type", "individual").is("erased_at", null);
  const donorIds = (donors ?? []).map((d) => d.id as string);
  if (!donorIds.length) return null;
  const { data: gifts } = await db.from("donations").select("id").in("donor_id", donorIds).eq("wants_18a", true).order("created_at", { ascending: false }).limit(20);
  const giftIds = (gifts ?? []).map((g) => g.id as string);
  if (!giftIds.length) return null;
  const { data: details } = await db
    .from("donation_checkout_details")
    .select("donation_id, id_number_encrypted, id_number_last4")
    .in("donation_id", giftIds)
    .not("id_number_encrypted", "is", null)
    .is("erased_at", null);
  // The newest gift that has one.
  const byGift = new Map((details ?? []).map((d) => [d.donation_id as string, d]));
  for (const id of giftIds) {
    const d = byGift.get(id);
    if (d?.id_number_encrypted && d.id_number_last4) return { encrypted: d.id_number_encrypted as string, last4: d.id_number_last4 as string };
  }
  return null;
}

/** The last four digits to show ("Use my ID ending 1234"), or null. */
export async function savedIdLast4(userId: string): Promise<string | null> {
  return (await latest(userId).catch(() => null))?.last4 ?? null;
}

/** The full number, for this donation's own encrypted copy. Server only. */
export async function savedIdNumber(userId: string): Promise<string | null> {
  const found = await latest(userId);
  return found ? decrypt(found.encrypted) : null;
}
