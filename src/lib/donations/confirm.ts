import "server-only";
import { logAudit } from "@/lib/audit";
import { taxYearFor } from "@/lib/dates";
import { gatewayByName, getGateway } from "@/lib/gateway";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyDonationPaid } from "./notify";
import { cardSaveWaitingFor, finishCardSave } from "./saved-card";
import { activateMonthlyDonation, cancelMonthlyBeforeStart, FIRST_PAYMENT_FAILED, monthlyHandledElsewhere, monthlyWaitingFor } from "./recurring";

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
/** What we already know about a payment, without asking the payment provider. */
export async function savedOutcome(reference: string): Promise<ConfirmOutcome> {
  if (!/^[0-9a-f-]{36}$/i.test(reference)) return "not_found";
  const { data, error } = await createAdminClient().from("donations").select("status").eq("gateway_ref", reference).maybeSingle();
  if (error) throw new PersistenceError("read the donation", error);
  if (!data) return "not_found";
  if (data.status === "paid" || data.status === "failed" || data.status === "review") return data.status;
  return "pending";
}

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
    await finishCardKeeping(donation, reference);
    return "paid";
  }
  if (donation.status !== "pending" && donation.status !== "failed") return donation.status as ConfirmOutcome;

  // After a gateway change, an old pending payment can't be checked any more: a person decides.
  if (donation.gateway !== getGateway().name) {
    console.warn(`[confirm] donation ${donation.id} is on gateway "${donation.gateway}", not the active one`);
    return "review";
  }
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
    let paidAt = tx.paidAt ? new Date(tx.paidAt) : new Date();
    if (Number.isNaN(paidAt.getTime())) {
      console.warn(`[confirm] unreadable paid_at from the gateway for ${donation.id}: ${String(tx.paidAt)}`);
      paidAt = new Date();
    }
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
      // The donor asked us to keep this card for next time. A failure must not hold back their confirmation
      // email: the request stays, and the next look at this paid gift (see the paid branch above) tries again.
      await finishCardSave(donation.id, tx, donation.gateway).catch((e) => console.error("[saved-card] card not kept yet", e));
      // A concurrent call that finished the monthly set-up first has already sent the email.
      if (!(donation.recurring_id && monthly === "none" && (await monthlyHandledElsewhere(donation.id)))) {
        await notifyDonationPaid(donation.id, { monthly });
      }
      return "paid";
    }
    // Nothing changed: another confirmation got there first. Trust only what is saved.
    const now = await currentStatus(donation.id);
    if (now === "paid") {
      // The other call may have died before the monthly set-up finished: finish it here too.
      await finishMonthlySetup(donation, reference);
      await finishCardKeeping(donation, reference);
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

/** A paid gift whose card was meant to be kept but was not (the first confirmation died part-way): do it now. */
async function finishCardKeeping(donation: { id: string; gateway: string }, reference: string): Promise<void> {
  if (!(await cardSaveWaitingFor(donation.id))) return;
  const again = await gatewayByName(donation.gateway).verifyTransaction(reference);
  if (again.status === "success") await finishCardSave(donation.id, again, donation.gateway);
}

async function currentStatus(donationId: string): Promise<string> {
  const { data, error } = await createAdminClient().from("donations").select("status").eq("id", donationId).maybeSingle();
  if (error) throw new PersistenceError("re-read the donation", error);
  if (!data) throw new PersistenceError("re-read the donation");
  return data.status;
}
