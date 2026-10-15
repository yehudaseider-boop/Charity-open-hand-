import "server-only";
import { logAudit } from "@/lib/audit";
import { getEmailTransport } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

export type EraseSummary = {
  donors: number;
  checkout_details: number;
  monthly_stopped: number;
  giving_choices: number;
  messages: number;
  gateway_records: number;
  /** The sign-in account was deleted too. False when there was none or it could not be (see `note`). */
  accountDeleted: boolean;
  note?: string;
};

const UUID = /^[0-9a-f-]{36}$/i;

/** What stays after an erasure, in words a person can read. */
export const ERASE_KEPT_TEXT =
  "We keep each donation's amount, date, charity and tax year, and any s18A receipt already issued, because tax law requires us to keep those records.";

/**
 * Erase everything that identifies a person, keeping only the records tax law requires
 * (donation amounts and dates, issued s18A receipts). Either by their account, or, for a
 * donor who never had one, by the email address they gave with.
 *
 * Order matters: the database erasure is one step, the confirmation email follows (to the address
 * we read beforehand), and the sign-in account is deleted last (deleting it also
 * removes their open privacy request, so the audit log is the lasting record).
 * Safe to run again.
 */
export async function eraseDonor(args: { userId?: string; email?: string; actorUserId: string }): Promise<EraseSummary> {
  const db = createAdminClient();
  const userId = args.userId && UUID.test(args.userId) ? args.userId : undefined;
  let email = args.email?.trim().toLowerCase();
  if (!userId && !email) throw new Error("Say whose information to erase.");

  if (userId && !email) {
    const { data, error } = await db.from("profiles").select("email").eq("id", userId).maybeSingle();
    if (error) throw error;
    email = (data?.email as string | undefined)?.toLowerCase();
  }

  // Every donor record that is theirs: linked to their account, or given with their address.
  const ids = new Set<string>();
  if (userId) {
    const { data, error } = await db.from("donors").select("id").eq("user_id", userId);
    if (error) throw error;
    for (const d of data ?? []) ids.add(d.id as string);
  }
  if (email) {
    const { data, error } = await db.from("donors").select("id").eq("email", email);
    if (error) throw error;
    for (const d of data ?? []) ids.add(d.id as string);
  }

  const { data: counts, error } = await db.rpc("erase_donor_data", { p_donor_ids: [...ids] });
  if (error) throw new Error(`Could not erase: ${error.message}`);
  const c = (counts ?? {}) as Record<string, number>;

  const summary: EraseSummary = {
    donors: c.donors ?? 0,
    checkout_details: c.checkout_details ?? 0,
    monthly_stopped: c.monthly_stopped ?? 0,
    giving_choices: c.giving_choices ?? 0,
    messages: c.messages ?? 0,
    gateway_records: c.gateway_records ?? 0,
    accountDeleted: false,
  };

  // Tell them once it is done and something was erased (the address is gone from our records now,
  // so we use the one we read before).
  if (email && summary.donors > 0) {
    try {
      await getEmailTransport().send({
        to: email,
        subject: "Your information has been erased",
        text: `As you asked, we have erased the information that identifies you from Givezy.\n\n${ERASE_KEPT_TEXT}\n\nGivezy`,
      });
    } catch (e) {
      console.error("[erase] confirmation email not sent", e);
    }
  }

  if (userId) {
    const blocked = await accountBlocker(userId);
    if (blocked) {
      summary.note = blocked;
    } else {
      // Their own account agreement goes with them. A charity's declarations stay with the charity
      // (the person's link to them is cleared when the account is deleted).
      const { error: consentError } = await db.from("consents").delete().eq("user_id", userId).eq("kind", "account");
      if (consentError) throw new Error(`Could not remove their agreement records: ${consentError.message}`);
      const { error: delError } = await db.auth.admin.deleteUser(userId);
      if (delError) summary.note = `Their sign-in account could not be deleted: ${delError.message}`;
      else summary.accountDeleted = true;
    }
  }

  // Counts only: no names or addresses in the audit log.
  await logAudit({
    actorUserId: args.actorUserId,
    action: "privacy.donor_erased",
    entityType: userId ? "user" : "donor",
    entityId: userId ?? null,
    details: { ...summary },
  });
  return summary;
}

/** True when an account exists for this address, so the person must be erased from their own request instead. */
export async function hasAccountFor(email: string): Promise<boolean> {
  const { count, error } = await createAdminClient()
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("email", email.trim().toLowerCase());
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Why a sign-in account must stay (it belongs to someone who runs a charity or the platform), or null. */
async function accountBlocker(userId: string): Promise<string | null> {
  const db = createAdminClient();
  const [{ data: profile }, { count: charities }] = await Promise.all([
    db.from("profiles").select("role").eq("id", userId).maybeSingle(),
    db.from("charity_admins").select("user_id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  if (profile?.role === "platform_admin") return "Their sign-in account was kept because they are a platform admin.";
  if ((charities ?? 0) > 0) return "Their sign-in account was kept because they manage a charity. Remove them from the charity first.";
  return null;
}
