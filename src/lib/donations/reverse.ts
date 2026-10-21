import "server-only";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Refunds and chargebacks (16/10/2026). A paid donation that is refunded or charged back stops counting:
 * charity totals, campaign progress and s18A receipts only count paid donations. The database allows only
 * paid -> refunded and paid -> charged_back. Anything the system can't be sure of is held for a person on
 * Admin, Payments, with buttons to mark the donation refunded or charged back.
 */

export type ReverseKind = "refunded" | "charged_back";
export type ReverseOutcome = "done" | "already" | "not_paid" | "not_found";

type Found = { id: string; status: string; total_charged_cents: number };

async function findByReference(reference: string): Promise<Found | null> {
  const { data, error } = await createAdminClient()
    .from("donations")
    .select("id, status, total_charged_cents")
    .eq("gateway_ref", reference)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id as string, status: data.status as string, total_charged_cents: Number(data.total_charged_cents) } : null;
}

/** Move one paid donation to refunded or charged back. Safe to repeat. */
export async function reverseDonation(donationId: string, kind: ReverseKind, actorUserId: string | null, how: string): Promise<ReverseOutcome> {
  const db = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("donations")
    .update(kind === "refunded" ? { status: "refunded", refunded_at: now } : { status: "charged_back", charged_back_at: now })
    .eq("id", donationId)
    .eq("status", "paid")
    .select("id");
  if (error) throw error;
  let outcome: ReverseOutcome = "done";
  if (!data?.length) {
    const { data: row, error: readError } = await db.from("donations").select("status").eq("id", donationId).maybeSingle();
    if (readError) throw readError;
    if (!row) return "not_found";
    // Already moved by an earlier try that failed before it finished: finish the follow-up below again,
    // so a receipt that needs re-issuing is never missed.
    if (row.status !== kind) return "not_paid";
    outcome = "already";
  }
  await logAudit({ actorUserId, action: kind === "refunded" ? "donation.refunded" : "donation.charged_back", entityType: "donation", entityId: donationId, details: { how } });
  // A chargeback disputes the authority to charge the card, so a monthly donation paid with it stops
  // and the card is dropped: every further collection would be another chargeback.
  if (kind === "charged_back") await stopMonthlyFor(donationId, actorUserId, "the payment was charged back");
  // An s18A receipt already issued with this donation on it is now wrong: a person voids and re-issues it.
  const { data: links, error: linkError } = await db.from("s18a_receipt_donations").select("receipt_id, s18a_receipts!inner(status)").eq("donation_id", donationId).eq("s18a_receipts.status", "issued");
  if (linkError) throw linkError;
  for (const l of links ?? []) {
    await logAudit({ actorUserId, action: "receipt.needs_reissue", entityType: "s18a_receipt", entityId: l.receipt_id as string, details: { donationId, kind } });
  }
  return outcome;
}

/** End the monthly donation a reversed payment belongs to (if any), keeping its history. Safe to repeat. */
async function stopMonthlyFor(donationId: string, actorUserId: string | null, reason: string): Promise<void> {
  const db = createAdminClient();
  const { data: d, error } = await db.from("donations").select("recurring_id").eq("id", donationId).maybeSingle();
  if (error) throw error;
  if (!d?.recurring_id) return;
  const { data: stopped, error: stopError } = await db
    .from("recurring_donations")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), ended_reason: reason, authorization_encrypted: null })
    .eq("id", d.recurring_id)
    .in("status", ["pending", "active", "paused"])
    .select("id");
  if (stopError) throw stopError;
  if (stopped?.length) {
    await logAudit({ actorUserId, action: "recurring.cancelled", entityType: "recurring_donation", entityId: d.recurring_id as string, details: { reason, donationId } });
  }
}

/** Pause the monthly donation a disputed payment belongs to (if any) until a person has looked. */
async function pauseMonthlyFor(donationId: string): Promise<void> {
  const db = createAdminClient();
  const { data: d, error } = await db.from("donations").select("recurring_id").eq("id", donationId).maybeSingle();
  if (error) throw error;
  if (!d?.recurring_id) return;
  const { data: paused, error: pauseError } = await db
    .from("recurring_donations")
    .update({ status: "paused", paused_at: new Date().toISOString() })
    .eq("id", d.recurring_id)
    .eq("status", "active")
    .select("id");
  if (pauseError) throw pauseError;
  if (paused?.length) {
    await logAudit({ actorUserId: null, action: "recurring.paused", entityType: "recurring_donation", entityId: d.recurring_id as string, details: { reason: "a payment was disputed", donationId } });
  }
}

/**
 * A refund from the gateway. Only a refund in rand can be matched to what the donor paid. A refund of the whole amount the donor paid marks the donation refunded.
 * A partial refund, an unknown amount or an unknown payment is held for a person.
 */
export async function handleRefund(reference: string | null, amountCents: number | null, eventRowId: string, currency: string | null = "ZAR"): Promise<void> {
  const d = reference ? await findByReference(reference) : null;
  if (!d) {
    await logAudit({ actorUserId: null, action: "refund.unmatched", entityType: "gateway_event", entityId: eventRowId, details: { reference, amountCents } });
    return;
  }
  if (currency === "ZAR" && amountCents !== null && amountCents === d.total_charged_cents) {
    const outcome = await reverseDonation(d.id, "refunded", null, "the payment provider refunded the full amount");
    if (outcome === "done" || outcome === "already") return;
  }
  await logAudit({ actorUserId: null, action: "donation.refund_review", entityType: "donation", entityId: d.id, details: { amountCents, currency, paidCents: d.total_charged_cents, status: d.status } });
}

/** A dispute (chargeback) opened or resolved: never changes a donation by itself, held for a person. */
export async function handleDispute(reference: string | null, stage: "opened" | "resolved", detail: string | null, eventRowId: string): Promise<void> {
  const d = reference ? await findByReference(reference) : null;
  if (d && stage === "opened") await pauseMonthlyFor(d.id);
  await logAudit({
    actorUserId: null,
    action: stage === "opened" ? "donation.dispute_opened" : "donation.dispute_resolved",
    entityType: d ? "donation" : "gateway_event",
    entityId: d ? d.id : eventRowId,
    details: { reference, outcome: detail },
  });
}
