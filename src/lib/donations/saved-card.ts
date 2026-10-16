import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";
import type { VerifiedTransaction } from "@/lib/gateway/types";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A donor's saved card for once-off gifts. The payment partner keeps the card; we keep only its
 * reusable token (encrypted) and what is needed to say "Card ending 4242". One card per account,
 * good for a gift to any charity. Server only: the table has no policies, so the app learns the
 * last four digits from our API and never reads the row.
 */

export type SavedCardInfo = { brand: string | null; last4: string | null; expires: string | null };

/** Thrown when the database refuses a write the card save needs, so the caller can retry. */
export class SavedCardError extends Error {
  constructor(what: string, cause?: unknown) {
    super(`Could not ${what}`, { cause });
    this.name = "SavedCardError";
  }
}

/** The card to show ("Card ending 4242"), never the token. Null when none is saved. */
export async function loadSavedCardInfo(userId: string): Promise<SavedCardInfo | null> {
  const { data, error } = await createAdminClient().from("saved_cards").select("card_brand, card_last4, card_exp").eq("user_id", userId).maybeSingle();
  if (error) throw new SavedCardError("read the saved card", error);
  return data ? { brand: data.card_brand, last4: data.card_last4, expires: data.card_exp } : null;
}

/** The token to charge, and the gateway that issued it. Null when none is saved or it cannot be read. */
export async function loadSavedCardToken(userId: string): Promise<{ code: string; gateway: string } | null> {
  const { data, error } = await createAdminClient().from("saved_cards").select("authorization_encrypted, gateway").eq("user_id", userId).maybeSingle();
  if (error) throw new SavedCardError("read the saved card", error);
  if (!data) return null;
  try {
    return { code: decrypt(data.authorization_encrypted), gateway: data.gateway };
  } catch (e) {
    console.error("[saved-card] stored card could not be read", e);
    return null;
  }
}

/** Forget the saved card. Safe to run when there is none. */
export async function removeSavedCard(userId: string): Promise<void> {
  const { error } = await createAdminClient().from("saved_cards").delete().eq("user_id", userId);
  if (error) throw new SavedCardError("remove the saved card", error);
}

/** The donor ticked "Save my card" on this gift: keep the card once the payment is confirmed. */
export async function requestCardSave(donationId: string, userId: string): Promise<void> {
  const { error } = await createAdminClient().from("card_save_requests").upsert({ donation_id: donationId, user_id: userId });
  if (error) throw new SavedCardError("record the request to save the card", error);
}

/** Is this payment waiting to have its card kept? */
export async function cardSaveWaitingFor(donationId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from("card_save_requests").select("donation_id").eq("donation_id", donationId).maybeSingle();
  if (error) throw new SavedCardError("read the request to save the card", error);
  return data !== null;
}

/**
 * The payment went through: keep the card (encrypted) if the donor asked, replacing any earlier one.
 * A card the gateway will not let us charge again is not kept, and the request is closed. Safe to
 * run again: once handled, the request is gone and this does nothing.
 */
export async function finishCardSave(donationId: string, tx: VerifiedTransaction, gateway: string): Promise<"saved" | "not_reusable" | "none"> {
  const db = createAdminClient();
  const { data: request, error } = await db.from("card_save_requests").select("user_id").eq("donation_id", donationId).maybeSingle();
  if (error) throw new SavedCardError("read the request to save the card", error);
  if (!request) return "none";
  const auth = tx.authorization;
  if (auth && auth.reusable) {
    const saved = await db.from("saved_cards").upsert({
      user_id: request.user_id,
      authorization_encrypted: encrypt(auth.code),
      card_brand: auth.brand,
      card_last4: auth.last4,
      card_exp: auth.expires,
      gateway,
    });
    if (saved.error) throw new SavedCardError("keep the card", saved.error);
  }
  const done = await db.from("card_save_requests").delete().eq("donation_id", donationId);
  if (done.error) throw new SavedCardError("close the request to save the card", done.error);
  return auth && auth.reusable ? "saved" : "not_reusable";
}
