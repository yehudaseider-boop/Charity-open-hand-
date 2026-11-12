import "server-only";
import { logAudit } from "@/lib/audit";
import { taxYearFor } from "@/lib/dates";
import { gatewayByName, getGateway } from "@/lib/gateway";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGatewayNotFound, type VerifiedTransaction } from "@/lib/gateway/types";
import { notifyDonationPaid, oweDonorConfirmation } from "./notify";
import { recordDecline } from "./giving-guard";
import { cardSaveWaitingFor, finishCardSave } from "./saved-card";
import { finishNewCard, newCardWaitingFor } from "./new-card";
import { addMonths, attemptDonationId, MAX_ATTEMPTS, periodOf } from "./schedule";
import { activateMonthlyDonation, cancelMonthlyBeforeStart, FIRST_PAYMENT_FAILED, monthlyHandledElsewhere, monthlyWaitingFor } from "./recurring";

/** A payment saved this recently is still being finished by the call that saved it. */
const RECENT_PAYMENT_MS = 3 * 60_000;

export type ConfirmOutcome = "paid" | "failed" | "pending" | "review" | "not_found" | "reversed";

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
  if (data.status === "refunded" || data.status === "charged_back") return "reversed";
  return "pending";
}

export type ConfirmOptions = {
  /**
   * The daily check only: a checkout started before this time that the provider says was abandoned (the donor
   * left its payment page) or never received is closed as failed, so it stops counting as a stuck payment. It can
   * still become paid later if the provider says so. Never a new card, and a monthly collection only with
   * `includeCollections` (the monthly job's own check of a try that has waited 48 hours).
   */
  closeAbandonedBefore?: Date;
  /** The monthly job only: a monthly collection may be closed the same way (an old try the provider has no charge for). */
  includeCollections?: boolean;
  /** Told when this call closed the payment as an unpaid checkout or try (rather than the provider saying it failed). */
  onClosed?: (why: "abandoned" | "never_received") => void;
};

export async function confirmPayment(reference: string, opts: ConfirmOptions = {}): Promise<ConfirmOutcome> {
  if (!/^[0-9a-f-]{36}$/i.test(reference)) return "not_found";
  const db = createAdminClient();
  const { data: donation, error: readError } = await db
    .from("donations")
    .select("id, status, gateway, total_charged_cents, recurring_id, created_at")
    .eq("gateway_ref", reference)
    .maybeSingle();
  if (readError) throw new PersistenceError("read the donation", readError);
  if (!donation) return "not_found";
  if (donation.status === "paid") {
    await finishMonthlySetup(donation, reference);
    await finishCardKeeping(donation, reference);
    await finishCardUpdate(donation, reference);
    return "paid";
  }
  if (donation.status === "refunded" || donation.status === "charged_back") return "reversed";
  if (donation.status !== "pending" && donation.status !== "failed") return donation.status as ConfirmOutcome;

  // After a gateway change, an old pending payment can't be checked any more: a person decides.
  if (donation.gateway !== getGateway().name) {
    console.warn(`[confirm] donation ${donation.id} is on gateway "${donation.gateway}", not the active one`);
    await logAudit({
      actorUserId: null,
      action: "donation.gateway_mismatch",
      entityType: "donation",
      entityId: donation.id,
      details: { gateway: donation.gateway, active: getGateway().name },
    });
    return "review";
  }
  let tx: VerifiedTransaction;
  try {
    tx = await gatewayByName(donation.gateway).verifyTransaction(reference);
  } catch (e) {
    // The provider never received it: an old checkout the donor never paid is closed (daily check only).
    if (isGatewayNotFound(e) && (await closableCheckout(donation, opts))) return closeCheckout(donation, "never_received", opts);
    throw e;
  }

  if (tx.status === "success") {
    if (tx.currency !== "ZAR" || tx.amountCents !== Number(donation.total_charged_cents)) {
      // Held for a person once: every later check (webhook, return page, daily) finds it already noted.
      if (!(await alreadyNoted("donation.amount_mismatch", donation.id))) {
        await logAudit({
          actorUserId: null,
          action: "donation.amount_mismatch",
          entityType: "donation",
          entityId: donation.id,
          details: { expected: donation.total_charged_cents, got: tx.amountCents, currency: tx.currency },
        });
      }
      return "review";
    }
    let paidAt = tx.paidAt ? new Date(tx.paidAt) : new Date();
    if (Number.isNaN(paidAt.getTime())) {
      console.warn(`[confirm] unreadable paid_at from the gateway for ${donation.id}: ${String(tx.paidAt)}`);
      paidAt = new Date();
    }
    // The donor's confirmation is noted as owed before the gift is saved as paid: if this call stops between the
    // two, the daily job's email retries send it (and a sent confirmation closes the note, so it never goes twice).
    await oweDonorConfirmation(donation.id);
    const { data: updated, error } = await db
      .from("donations")
      .update({ status: "paid", paid_at: paidAt.toISOString(), tax_year: taxYearFor(paidAt) })
      .eq("id", donation.id)
      .in("status", ["pending", "failed"])
      .select("id");
    if (error) throw new PersistenceError("save the paid donation", error);
    if (updated?.length) {
      // Two collections of one monthly donation for one month both paid: a person refunds one (never automatic).
      if (donation.recurring_id) await flagMonthPaidTwice(donation.id, donation.recurring_id, donation.created_at);
      // Set up the monthly donation first (a failure here is retried: see the paid branch above).
      const monthly = donation.recurring_id ? await activateMonthlyDonation(donation.id, tx) : "none";
      // A new card for a monthly donation whose card was declined: keep it, and carry the monthly donation on.
      // A failure here is retried the same way (see the paid branch above).
      if (donation.recurring_id) await finishNewCard(donation.id, tx);
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
      await finishCardUpdate(donation, reference);
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
      // Card-testing protection: count the decline against whoever started this gift (never throws).
      await recordDecline(donation.id);
      return "failed";
    }
    const now = await currentStatus(donation.id);
    if (now === "failed") return "failed";
    if (now === "pending") throw new PersistenceError("save the failed donation");
    return now as ConfirmOutcome; // paid (or later) by a concurrent confirmation
  }
  // An old checkout the donor left on the provider's page: closed as failed (daily check only).
  if (tx.status === "pending" && tx.abandoned && (await closableCheckout(donation, opts))) return closeCheckout(donation, "abandoned", opts);
  // A monthly charge we marked as turned down that the provider is still working on is not settled: saying
  // "failed" would let the monthly job charge the donor again for the same month.
  if (donation.status === "failed" && donation.recurring_id && tx.status === "pending") return "pending";
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

/**
 * A paid card update whose card was not kept yet (the call that saved the payment stopped part-way): finish it now.
 * Leaves a payment saved in the last few minutes alone: the call that saved it is most likely still finishing it,
 * and two at once would only repeat the same changes and the same email. The daily check comes back later.
 */
async function finishCardUpdate(donation: { id: string; gateway: string; recurring_id: string | null }, reference: string): Promise<void> {
  if (!donation.recurring_id || !(await newCardWaitingFor(donation.id))) return;
  const again = await gatewayByName(donation.gateway).verifyTransaction(reference);
  if (again.status !== "success") return;
  const paidAt = again.paidAt ? new Date(again.paidAt).getTime() : 0;
  if (Number.isFinite(paidAt) && Date.now() - paidAt < RECENT_PAYMENT_MS) return;
  const done = await finishNewCard(donation.id, again);
  // Only the call that really finished it sends the confirmation the first call never got to send.
  if (done.finishedHere) await notifyDonationPaid(donation.id);
}

/** Is there already an audit row of this kind for this donation? If the check itself fails, says no (noted twice beats never). */
async function alreadyNoted(action: string, donationId: string): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().from("audit_log").select("id").eq("action", action).eq("entity_id", donationId).limit(1);
    return !error && (data ?? []).length > 0;
  } catch {
    return false;
  }
}

type Closable = { id: string; status: string; recurring_id: string | null; created_at?: string | null };

/**
 * May the daily check close this payment as an abandoned checkout? Only a pending one started before the cut-off,
 * and only a checkout: a once-off gift, or the first payment of a monthly donation. Never a monthly collection or a
 * new card (their own jobs settle them).
 */
async function closableCheckout(d: Closable, opts: ConfirmOptions): Promise<boolean> {
  if (!opts.closeAbandonedBefore || d.status !== "pending" || !d.created_at) return false;
  const created = new Date(d.created_at).getTime();
  if (!Number.isFinite(created) || created >= opts.closeAbandonedBefore.getTime()) return false;
  if (!d.recurring_id) return true;
  if (opts.includeCollections && collectionPeriodOf(d.id, d.recurring_id, d.created_at) !== null) return true;
  const { data, error } = await createAdminClient().from("recurring_donations").select("id").eq("id", d.recurring_id).eq("first_donation_id", d.id).maybeSingle();
  if (error) throw new PersistenceError("read the monthly donation", error);
  return Boolean(data);
}

/**
 * Close an abandoned checkout as failed. Not a declined card (it isn't counted against the donor), and failed can
 * still become paid if the provider later says it was paid. A monthly donation whose first payment this was is
 * closed the way a failed first payment is, so it still starts if that payment goes through after all.
 */
async function closeCheckout(d: Closable, why: "abandoned" | "never_received", opts: ConfirmOptions = {}): Promise<ConfirmOutcome> {
  const db = createAdminClient();
  const { data: updated, error } = await db
    .from("donations")
    .update({ status: "failed", failed_at: new Date().toISOString() })
    .eq("id", d.id)
    .eq("status", "pending")
    .select("id");
  if (error) throw new PersistenceError("close the abandoned checkout", error);
  if (!updated?.length) {
    const now = await currentStatus(d.id);
    if (now === "pending") throw new PersistenceError("close the abandoned checkout");
    return now === "refunded" || now === "charged_back" ? "reversed" : (now as ConfirmOutcome);
  }
  opts.onClosed?.(why);
  if (d.recurring_id) await cancelMonthlyBeforeStart(d.id, FIRST_PAYMENT_FAILED);
  await logAudit({ actorUserId: null, action: "donation.checkout_closed", entityType: "donation", entityId: d.id, details: { why } }).catch((e) =>
    console.error("[confirm] could not note a closed checkout", e),
  );
  return "failed";
}

/**
 * The month a monthly collection try was for, worked out from its id (each try's id is made from the monthly
 * donation, the month and the try number: see schedule.ts). Null for anything else (a first payment, a new card).
 * A try is made in its own month or the month after (a retry that runs after midnight on the 1st).
 */
export function collectionPeriodOf(donationId: string, recurringId: string, createdAt: string | null | undefined): string | null {
  const created = createdAt ? new Date(createdAt) : null;
  if (!created || Number.isNaN(created.getTime())) return null;
  const here = periodOf(created);
  for (const period of [here, addMonths(here, -1)]) {
    for (let n = 0; n < MAX_ATTEMPTS; n++) if (attemptDonationId(recurringId, period, n) === donationId) return period;
  }
  return null;
}

/**
 * A monthly collection just became paid while another try for the same month was paid too (a late answer from the
 * provider): the donor paid twice for one month. Written once for a person (Admin, Payments and the daily email), who
 * refunds one of the two. Never refunds by itself, and never stops the payment being recorded.
 */
async function flagMonthPaidTwice(donationId: string, recurringId: string, createdAt: string | null | undefined): Promise<void> {
  try {
    const period = collectionPeriodOf(donationId, recurringId, createdAt);
    if (!period) return;
    const others = Array.from({ length: MAX_ATTEMPTS }, (_, n) => attemptDonationId(recurringId, period, n)).filter((id) => id !== donationId);
    const { data, error } = await createAdminClient().from("donations").select("id").in("id", others).eq("status", "paid");
    if (error || !(data ?? []).length) return;
    if (await alreadyNoted("monthly.paid_twice", donationId)) return;
    await logAudit({
      actorUserId: null,
      action: "monthly.paid_twice",
      entityType: "donation",
      entityId: donationId,
      details: { recurring: recurringId, period, alsoPaid: (data ?? []).map((d) => d.id) },
    });
  } catch (e) {
    console.error("[confirm] could not check for a month paid twice", e);
  }
}

async function currentStatus(donationId: string): Promise<string> {
  const { data, error } = await createAdminClient().from("donations").select("status").eq("id", donationId).maybeSingle();
  if (error) throw new PersistenceError("re-read the donation", error);
  if (!data) throw new PersistenceError("re-read the donation");
  return data.status;
}
