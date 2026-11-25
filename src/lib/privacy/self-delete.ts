import "server-only";
import { legalConfig } from "@/config/legal";
import { logAudit } from "@/lib/audit";
import {
  CHARGE_IN_FLIGHT_MS,
  DELETE_MESSAGES,
  confirmationOk,
  deletionEmail,
  signInIsRecent,
  type DeleteCode,
} from "@/lib/delete-account";
import { createAdminClient } from "@/lib/supabase/admin";
import { eraseDonor } from "./erase";

/**
 * Deleting your own account from the phone app, at once (25/11/2026; Apple 5.1.1(v), Google Play). All the wording
 * and the plain rules are in src/lib/delete-account.ts (DRAFT for Yosef); the route is /api/app/delete-account.
 *
 * It reuses the existing erasure (src/lib/privacy/erase.ts), which keeps what tax law makes us keep, and adds the
 * checks and the stopping of charges around it. Order:
 *   1. refuse (manager, Givezy admin, open privacy request, the reviewer's sign-in, a charge on its way);
 *   2. a recent sign-in, then the typed confirmation;
 *   3. an audit row that it started (no personal details);
 *   4. stop every monthly donation and remove the saved card, and CHECK that nothing is left that could charge: if that
 *      cannot be done, stop here with everything else kept;
 *   5. the erasure, which sends the confirmation email after its work and deletes the sign-in account last.
 * Every step can be run again after a cut-off: pressing again carries on where it stopped.
 */

export type DeleteReply = { status: number; body: { ok: true; message: string } | { ok: false; code: DeleteCode; message: string } };

const refuse = (status: number, code: DeleteCode): DeleteReply => ({ status, body: { ok: false, code, message: DELETE_MESSAGES[code] } });

type Db = ReturnType<typeof createAdminClient>;

/** Why this account may not be deleted from the app, or null. Throws when it cannot be checked (the caller says nothing was deleted). */
export async function whyNotDeletable(userId: string, email: string, now = Date.now(), env: Record<string, string | undefined> = process.env): Promise<DeleteCode | null> {
  const db = createAdminClient();
  // The reviewer's sign-in is never deleted, whatever else is true of it, and whether or not the fixed code is switched on.
  const reviewer = (env.REVIEW_SIGN_IN_EMAIL ?? "").trim().toLowerCase();
  if (reviewer && email.trim().toLowerCase() === reviewer) return "reviewer";

  const [profile, admins, requests] = await Promise.all([
    db.from("profiles").select("role").eq("id", userId).maybeSingle(),
    db.from("charity_admins").select("user_id", { count: "exact", head: true }).eq("user_id", userId),
    db.from("data_requests").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "open"),
  ]);
  for (const r of [profile, admins, requests]) if (r.error) throw new Error(`Could not check the account: ${r.error.message}`);
  if (profile.data?.role === "platform_admin") return "platform_admin";
  if ((admins.count ?? 0) > 0) return "manager";
  if ((requests.count ?? 0) > 0) return "request_open";

  // A monthly charge that started in the last half hour may still be on its way: wait, so nobody is charged after deleting.
  const donorIds = await donorIdsOf(db, userId);
  if (donorIds.length) {
    const since = new Date(now - CHARGE_IN_FLIGHT_MS).toISOString();
    const { count, error } = await db
      .from("donations")
      .select("id", { count: "exact", head: true })
      .in("donor_id", donorIds)
      .eq("status", "pending")
      .not("recurring_id", "is", null)
      .gte("created_at", since);
    if (error) throw new Error(`Could not check for a charge on its way: ${error.message}`);
    if ((count ?? 0) > 0) return "payment_in_progress";
  }
  return null;
}

async function donorIdsOf(db: Db, userId: string): Promise<string[]> {
  const { data, error } = await db.from("donors").select("id").eq("user_id", userId);
  if (error) throw new Error(`Could not read the donor records: ${error.message}`);
  return (data ?? []).map((d) => d.id as string);
}

/**
 * Stop every monthly donation and remove the saved card, then check. A donor must never be charged after deleting.
 *
 * There is no call to make to the payment provider: Givezy itself starts every monthly charge from the card token it
 * keeps (encrypted) on the donation, and the provider never charges on its own. So cancelling means marking the donation
 * cancelled and destroying that token, here, and checking by reading it back. If any of that fails the deletion stops
 * with everything kept. (If a provider-side "forget this card" call is ever added to the gateway adapter, it goes here,
 * and a refusal from it stops the deletion the same way.) Safe to run again.
 */
export async function stopAllCharging(userId: string, now = new Date()): Promise<boolean> {
  const db = createAdminClient();
  try {
    const donorIds = await donorIdsOf(db, userId);
    if (donorIds.length) {
      const { error } = await db
        .from("recurring_donations")
        .update({
          status: "cancelled",
          cancelled_at: now.toISOString(),
          authorization_encrypted: null,
          ended_reason: "the donor deleted their account",
          card_last4: null,
          card_brand: null,
          card_exp: null,
          needs_gateway_sync: false,
        })
        .in("donor_id", donorIds)
        .or("status.neq.cancelled,authorization_encrypted.not.is.null");
      if (error) throw error;
    }
    for (const table of ["saved_cards", "card_save_requests"] as const) {
      const { error } = await db.from(table).delete().eq("user_id", userId);
      if (error) throw error;
    }
    // Check, never assume: nothing is left that could charge them.
    if (donorIds.length) {
      const { count, error } = await db
        .from("recurring_donations")
        .select("id", { count: "exact", head: true })
        .in("donor_id", donorIds)
        .or("status.neq.cancelled,authorization_encrypted.not.is.null");
      if (error) throw error;
      if ((count ?? 0) > 0) return false;
    }
    const { count: cards, error: cardError } = await db.from("saved_cards").select("user_id", { count: "exact", head: true }).eq("user_id", userId);
    if (cardError) throw cardError;
    return (cards ?? 0) === 0;
  } catch (e) {
    console.error("[delete-account] could not stop the charging", e instanceof Error ? e.message : e);
    return false;
  }
}

/** What the screen asks before the person types anything: can this account be deleted here, and must they sign in again first? */
export async function deletePreflight(account: { userId: string; email: string; signedInAt: number | null }, now = Date.now()): Promise<DeleteReply | { status: 200; body: { ok: true; signInAgain: boolean } }> {
  let why: DeleteCode | null;
  try {
    why = await whyNotDeletable(account.userId, account.email, now);
  } catch (e) {
    console.error("[delete-account] could not check", e instanceof Error ? e.message : e);
    return refuse(503, "unavailable");
  }
  if (why) return refuse(409, why);
  return { status: 200, body: { ok: true, signInAgain: !signInIsRecent(account.signedInAt, now) } };
}

/** Delete the signed-in person's account. See the order at the top. `confirm` is what they typed. */
export async function deleteOwnAccount(account: { userId: string; email: string; signedInAt: number | null }, confirm: unknown, now = Date.now()): Promise<DeleteReply> {
  let why: DeleteCode | null;
  try {
    why = await whyNotDeletable(account.userId, account.email, now);
  } catch (e) {
    console.error("[delete-account] could not check", e instanceof Error ? e.message : e);
    return refuse(503, "unavailable");
  }
  if (why) {
    await audit(account.userId, "privacy.account_delete_refused", { reason: why });
    return refuse(409, why);
  }
  if (!signInIsRecent(account.signedInAt, now)) return refuse(401, "sign_in_again");
  if (!confirmationOk(confirm, account.email)) return refuse(400, "confirm");

  // Recorded before any work, so a run that is cut off leaves a trace. No names or addresses: who and when only.
  if (!(await audit(account.userId, "privacy.account_delete_started", {}))) return refuse(503, "unavailable");

  if (!(await stopAllCharging(account.userId))) {
    await audit(account.userId, "privacy.account_delete_refused", { reason: "cancel_failed" });
    return refuse(502, "cancel_failed");
  }

  try {
    const summary = await eraseDonor({
      userId: account.userId,
      actorUserId: account.userId,
      auditAction: "privacy.account_deleted_in_app",
      confirmationEmail: () => deletionEmail(legalConfig.supportEmail),
    });
    if (!summary.accountDeleted) {
      console.error("[delete-account] erased, but the sign-in account stayed");
      return refuse(500, "incomplete");
    }
  } catch (e) {
    console.error("[delete-account] the erasure stopped part way", e instanceof Error ? e.message : e);
    return refuse(500, "incomplete");
  }
  return { status: 200, body: { ok: true, message: "Your account has been deleted. We have emailed you a confirmation." } };
}

/** An audit row with no personal details. Returns false when it could not be written (never throws). */
async function audit(userId: string, action: string, details: Record<string, unknown>): Promise<boolean> {
  try {
    await logAudit({ actorUserId: userId, action, entityType: "user", entityId: userId, details });
    return true;
  } catch (e) {
    console.error("[delete-account] audit not written", e instanceof Error ? e.message : e);
    return false;
  }
}
