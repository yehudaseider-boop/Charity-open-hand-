import "server-only";
import { logAudit } from "@/lib/audit";
import { taxYearFor } from "@/lib/dates";
import { gatewayByName } from "@/lib/gateway";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyDonationPaid } from "./notify";
import { activateMonthlyDonation, cancelMonthlyBeforeStart, FIRST_PAYMENT_FAILED, monthlyWaitingFor } from "./recurring";

export type ConfirmOutcome = "paid" | "failed" | "pending" | "review" | "not_found";

/** The donation could not be read or written, so no final answer can be given. Safe to retry. */
export class PersistenceError extends Error {
  constructor(what: string, cause?: unknown) {
    super(`Could not ${what}`, { cause });
    this.name = "PersistenceError";
  }
}

/**
 * Ask the gateway whether a payment went through and record the answer.
 * Safe to call any number of times (webhook, return page, retries): a
 * donation only moves pending -> paid/failed once, and only the call that
 * makes the move sends the confirmation email.
 *
 * A database failure throws PersistenceError. It never reports "paid" or
 * "failed" unless that state is saved, so callers can retry safely (the
 * webhook answers with an error so the gateway sends the event again).
 */
export async function confirmPayment(reference: string): Promise<ConfirmOutcome> {
  if (!/^[0-9a-f-]{36}$/i.test(reference)) return "not_found";
  const db = createAdminClient();
  const { data: donation, error: readError } = await db
    .from("donations")
    .select("id, status, gateway, total_charged_cents, recurring_id")
    .eq("gateway_ref", reference)
    .maybeSingle();
  if (readError) throw new PersistenceError("read the donation", readError);
  if (!donation) return "not_found";
  if (donation.status === "paid") {
    await finishMonthlySetup(donation, reference);
    return "paid";
  }
  if (donation.status !== "pending" && donation.status !== "failed") return donation.status as ConfirmOutcome;

  const tx = await gatewayByName(donation.gateway).verifyTransaction(reference);

  if (tx.status === "success") {
    if (tx.currency !== "ZAR" || tx.amountCents !== Number(donation.total_charged_cents)) {
      await logAudit({
        actorUserId: null,
        action: "donation.amount_mismatch",
        entityType: "donation",
        entityId: donation.id,
        details: { expected: donation.total_charged_cents, got: tx.amountCents, currency: tx.currency },
      });
      return "review";
    }
    const paidAt = tx.paidAt ? new Date(tx.paidAt) : new Date();
    const { data: updated, error } = await db
      .from("donations")
      .update({ status: "paid", paid_at: paidAt.toISOString(), tax_year: taxYearFor(paidAt) })
      .eq("id", donation.id)
      .in("status", ["pending", "failed"])
      .select("id");
    if (error) throw new PersistenceError("save the paid donation", error);
    if (updated?.length) {
      // Set up the monthly donation first (a failure here is retried: see the paid branch above).
      const monthly = donation.recurring_id ? await activateMonthlyDonation(donation.id, tx) : "none";
      await notifyDonationPaid(donation.id, { monthly });
      return "paid";
    }
    // Nothing changed: another confirmation got there first. Trust only what is saved.
    const now = await currentStatus(donation.id);
    if (now === "paid") {
      // The other call may have died before the monthly set-up finished: finish it here too.
      await finishMonthlySetup(donation, reference);
      return "paid";
    }
    if (now === "pending" || now === "failed") throw new PersistenceError("save the paid donation");
    return now as ConfirmOutcome;
  }

  if (tx.status === "failed" && donation.status === "pending") {
    const { data: updated, error } = await db
      .from("donations")
      .update({ status: "failed", failed_at: new Date().toISOString() })
      .eq("id", donation.id)
      .eq("status", "pending")
      .select("id");
    if (error) throw new PersistenceError("save the failed donation", error);
    if (updated?.length) {
      if (donation.recurring_id) await cancelMonthlyBeforeStart(donation.id, FIRST_PAYMENT_FAILED);
      return "failed";
    }
    const now = await currentStatus(donation.id);
    if (now === "failed") return "failed";
    if (now === "pending") throw new PersistenceError("save the failed donation");
    return now as ConfirmOutcome; // paid (or later) by a concurrent confirmation
  }
  return donation.status === "failed" ? "failed" : "pending";
}

/**
 * A first monthly payment that was saved as paid but whose monthly set-up did not finish (or never
 * sent its confirmation email): finish it now. Does nothing for any other donation.
 */
async function finishMonthlySetup(donation: { id: string; gateway: string; recurring_id: string | null }, reference: string): Promise<void> {
  if (!donation.recurring_id || !(await monthlyWaitingFor(donation.id))) return;
  const again = await gatewayByName(donation.gateway).verifyTransaction(reference);
  if (again.status !== "success") return;
  const monthly = await activateMonthlyDonation(donation.id, again);
  if (monthly !== "none") await notifyDonationPaid(donation.id, { monthly });
}

async function currentStatus(donationId: string): Promise<string> {
  const { data, error } = await createAdminClient().from("donations").select("status").eq("id", donationId).maybeSingle();
  if (error) throw new PersistenceError("re-read the donation", error);
  if (!data) throw new PersistenceError("re-read the donation");
  return data.status;
}
