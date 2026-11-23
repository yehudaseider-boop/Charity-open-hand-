import "server-only";
import { logAudit } from "@/lib/audit";
import { confirmPayment } from "@/lib/donations/confirm";
import { GatewayError, gatewayForEvents } from "@/lib/gateway";
import { alertGivezy } from "@/lib/ops/alert";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Refunds and chargebacks (16/10/2026). A paid donation that is refunded or charged back stops counting:
 * charity totals, campaign progress and s18A receipts only count paid donations. The database allows only
 * paid -> refunded and paid -> charged_back. Anything the system can't be sure of is held for a person on
 * Admin, Payments, with buttons to mark the donation refunded or charged back.
 */

export type ReverseKind = "refunded" | "charged_back";
export type ReverseOutcome = "done" | "already" | "not_paid" | "not_found";
/** What recording a partial refund did: see record_partial_refund (migration 20261120000001). */
export type PartialRefundOutcome = "done" | "already" | "not_paid" | "not_found" | "too_much";

/**
 * Why a gift is kept off s18A receipts until a person has looked (donations.receipt_hold, 20/11/2026). The
 * receipt run and issue_s18a_receipt both skip a held gift.
 */
export const RECEIPT_HOLD = { dispute: "dispute open", refundReview: "refund being reviewed" } as const;

type Found = { id: string; status: string; amount_cents: number; total_charged_cents: number; gateway: string };

async function findByReference(reference: string): Promise<Found | null> {
  const { data, error } = await createAdminClient()
    .from("donations")
    .select("id, status, amount_cents, total_charged_cents, gateway")
    .eq("gateway_ref", reference)
    .maybeSingle();
  if (error) throw error;
  return data
    ? { id: data.id as string, status: data.status as string, amount_cents: Number(data.amount_cents), total_charged_cents: Number(data.total_charged_cents), gateway: String(data.gateway) }
    : null;
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
  await withdrawReceiptsFor(donationId, actorUserId, kind, `a donation on it was ${kind === "refunded" ? "refunded" : "charged back"}`);
  return outcome;
}

/**
 * An s18A receipt already issued with this donation on it is now wrong. It is withdrawn straight away, so
 * it can no longer be downloaded, emailed or shown as valid; a person then issues the corrected one (the
 * donor's other gifts go back on the charity's receipts list, as after any withdrawal). Safe to repeat.
 */
async function withdrawReceiptsFor(donationId: string, actorUserId: string | null, kind: ReverseKind | "partly_refunded", what: string, issuedBefore?: string): Promise<void> {
  const db = createAdminClient();
  const { data: links, error: linkError } = await db.from("s18a_receipt_donations").select("receipt_id, s18a_receipts!inner(status, issued_at)").eq("donation_id", donationId).eq("s18a_receipts.status", "issued");
  if (linkError) throw linkError;
  for (const l of links ?? []) {
    // A receipt issued after the refund was recorded already shows what is left of the gift: it stays (review
    // 20/11/2026: a repeated refund event, or a receipt issued in between, would otherwise void a correct receipt).
    const issuedAt = (Array.isArray(l.s18a_receipts) ? l.s18a_receipts[0] : l.s18a_receipts) as { issued_at?: string | null } | null;
    if (issuedBefore && issuedAt?.issued_at && new Date(issuedAt.issued_at).getTime() >= new Date(issuedBefore).getTime()) continue;
    const reason = `Withdrawn automatically: ${what}. A corrected receipt follows.`;
    const { error: voidError } = await db
      .from("s18a_receipts")
      .update({ status: "void", voided_at: new Date().toISOString(), void_reason: reason })
      .eq("id", l.receipt_id as string)
      .eq("status", "issued");
    if (voidError) throw voidError;
    await logAudit({ actorUserId, action: "receipt.voided", entityType: "s18a_receipt", entityId: l.receipt_id as string, details: { reason, donationId, kind } });
    await logAudit({ actorUserId, action: "receipt.needs_reissue", entityType: "s18a_receipt", entityId: l.receipt_id as string, details: { donationId, kind } });
  }
}

/**
 * Part of a paid gift was refunded: `amountCents` of the gift itself (never Givezy's contribution or the card
 * charge) stops counting on s18A receipts. Recorded once per `source` (the payment provider's event, or one admin
 * entry), so a repeat delivery never counts it twice, and never past what is left of the gift. An issued receipt
 * with the gift on it is withdrawn for re-issue. A gift refunded in full this way (and with nothing else charged)
 * is marked refunded. Safe to repeat.
 */
export async function recordPartialRefund(donationId: string, amountCents: number, source: string, actorUserId: string | null, how: string): Promise<PartialRefundOutcome> {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error("A refund must be a whole number of cents above 0");
  const db = createAdminClient();
  const { data, error } = await db.rpc("record_partial_refund", { p_donation_id: donationId, p_amount_cents: amountCents, p_source: source, p_actor: actorUserId });
  if (error) throw error;
  const outcome = data as PartialRefundOutcome;
  if (outcome !== "done" && outcome !== "already") return outcome;
  if (outcome === "done") {
    await logAudit({ actorUserId, action: "donation.partly_refunded", entityType: "donation", entityId: donationId, details: { amountCents, source, how } });
  }
  // Also on a repeat: an earlier try may have stopped before the receipt was withdrawn. Only receipts issued before
  // this refund was recorded are withdrawn: one issued since already counts what is left.
  const { data: refundRow, error: refundError } = await db.from("donation_refunds").select("created_at").eq("source", source).maybeSingle();
  if (refundError) throw refundError;
  await withdrawReceiptsFor(donationId, actorUserId, "partly_refunded", "part of a donation on it was refunded", (refundRow?.created_at as string | undefined) ?? new Date().toISOString());
  const { data: row, error: readError } = await db.from("donations").select("status, amount_cents, refunded_cents, total_charged_cents").eq("id", donationId).maybeSingle();
  if (readError) throw readError;
  if (row && row.status === "paid" && Number(row.refunded_cents) === Number(row.amount_cents) && Number(row.total_charged_cents) === Number(row.amount_cents)) {
    await reverseDonation(donationId, "refunded", actorUserId, "the whole gift was refunded in parts");
  }
  return outcome;
}

/** A gift's hold reasons, as stored in receipt_hold ("dispute open; refund being reviewed"). */
export const holdReasons = (hold: string | null | undefined): string[] =>
  (hold ?? "").split(";").map((r) => r.trim()).filter(Boolean);
const joinReasons = (reasons: string[]): string | null => (reasons.length ? reasons.join("; ") : null);

/**
 * Change a gift's hold reasons without losing one written at the same moment: the change is saved only if the hold
 * is still what was read, and is read again otherwise (a few tries). Returns the reasons before and after.
 */
async function changeHold(donationId: string, change: (reasons: string[]) => string[]): Promise<{ before: string[]; after: string[] } | null> {
  const db = createAdminClient();
  for (let i = 0; i < 5; i++) {
    const { data: row, error } = await db.from("donations").select("receipt_hold").eq("id", donationId).maybeSingle();
    if (error) throw error;
    if (!row) return null;
    const current = (row.receipt_hold as string | null) ?? null;
    const before = holdReasons(current);
    const after = change(before);
    if (joinReasons(after) === joinReasons(before)) return { before, after };
    const q = db.from("donations").update({ receipt_hold: joinReasons(after) }).eq("id", donationId);
    const { data: saved, error: saveError } = await (current === null ? q.is("receipt_hold", null) : q.eq("receipt_hold", current)).select("id");
    if (saveError) throw saveError;
    if (saved?.length) return { before, after };
  }
  throw new Error("The receipt hold kept changing; try again");
}

/**
 * Keep a gift off s18A receipts until a person has looked. Each reason is kept on its own (review 20/11/2026: a
 * refund to check that arrived during an open dispute was lost, so releasing the won dispute receipted the gift).
 */
async function holdReceipt(donationId: string, reason: string): Promise<void> {
  await changeHold(donationId, (reasons) => (reasons.includes(reason) ? reasons : [...reasons, reason]));
}

/**
 * A platform admin has checked a held gift: it may go on an s18A receipt again. Returns false when it was not
 * held. Logged.
 */
export async function clearReceiptHold(donationId: string, actorUserId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from("donations").update({ receipt_hold: null }).eq("id", donationId).not("receipt_hold", "is", null).select("id");
  if (error) throw error;
  if (!data?.length) return false;
  await logAudit({ actorUserId, action: "donation.receipt_hold_cleared", entityType: "donation", entityId: donationId, details: {} });
  return true;
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
  // Held, not just paused: the donor cannot resume it until a person has looked (releaseDisputeHold).
  // One the donor had already paused keeps its own paused_at; only a running one is paused now.
  const { data: paused, error: pauseError } = await db
    .from("recurring_donations")
    .update({ status: "paused", paused_at: new Date().toISOString(), held_reason: "a payment was disputed" })
    .eq("id", d.recurring_id)
    .eq("status", "active")
    .select("id");
  if (pauseError) throw pauseError;
  const { data: held, error: holdError } = await db
    .from("recurring_donations")
    .update({ held_reason: "a payment was disputed" })
    .eq("id", d.recurring_id)
    .eq("status", "paused")
    .select("id");
  if (holdError) throw holdError;
  if (paused?.length || held?.length) {
    await logAudit({ actorUserId: null, action: "recurring.paused", entityType: "recurring_donation", entityId: d.recurring_id as string, details: { reason: "a payment was disputed", donationId } });
  }
}

/**
 * A refund from the gateway. Only a refund in rand can be matched to what the donor paid. A refund of the whole amount the donor paid marks the donation refunded.
 * A partial refund of a gift that was charged on its own (no contribution or card charge on top, so the refund can
 * only have come off the gift) is recorded against the gift, once per gateway event (20/11/2026). Anything else (a
 * partial refund of a payment with more than the gift on it, an unknown amount or currency, too much) is held for
 * a person, and the gift is kept off s18A receipts until they have looked. A refund for a payment not yet
 * recorded as paid is first checked with the provider (confirmPayment); one the provider doesn't confirm is held too.
 */
export async function handleRefund(reference: string | null, amountCents: number | null, eventRowId: string, currency: string | null = "ZAR"): Promise<void> {
  let d = reference ? await findByReference(reference) : null;
  if (!d || !reference) {
    await logAudit({ actorUserId: null, action: "refund.unmatched", entityType: "gateway_event", entityId: eventRowId, details: { reference, amountCents } });
    return;
  }
  // The refund can arrive before we have recorded the payment as paid (its success event is still being
  // retried). Ask the provider first, as the success event would: once it is recorded paid, the refund below
  // applies as usual. If the provider doesn't say it was paid, the refund is held for a person as before.
  // confirmPayment never handles refunds, so this can't loop, and both steps are safe to repeat.
  if (d.status === "pending" || d.status === "failed") {
    // Ask the provider plainly first. A payment already refunded there answers "reversed", which confirmPayment
    // would record as a declined card (and cancel a monthly donation as "first payment failed"), so confirmPayment
    // runs only when the provider says the payment succeeded. A provider that answers "no such payment" or turns
    // the check down won't answer differently on a repeat: held for a person. Anything else that fails (an
    // outage, our database) is thrown, so the event is sent again.
    const seen = await gatewayForEvents(d.gateway).verifyTransaction(reference).catch((e) => {
      if (e instanceof GatewayError && (e.notFound || e.refused)) return null;
      throw e;
    });
    if (seen?.status === "success") {
      const outcome = await confirmPayment(reference);
      if (outcome === "paid") d = (await findByReference(reference)) ?? d;
    }
  }
  if (currency === "ZAR" && amountCents !== null && amountCents === d.total_charged_cents) {
    const outcome = await reverseDonation(d.id, "refunded", null, "the payment provider refunded the full amount");
    if (outcome === "done" || outcome === "already") return;
  }
  // The gateway event row is the refund's own: the adapter keys each refund event by the refund itself, so two
  // partial refunds are two rows and a repeat delivery of one finds the same row.
  if (currency === "ZAR" && amountCents !== null && amountCents > 0 && amountCents < d.total_charged_cents && d.total_charged_cents === d.amount_cents) {
    const outcome = await recordPartialRefund(d.id, amountCents, `gateway_event:${eventRowId}`, null, "the payment provider refunded part of the payment");
    if (outcome === "done" || outcome === "already") return;
  }
  await holdReceipt(d.id, RECEIPT_HOLD.refundReview);
  await logAudit({ actorUserId: null, action: "donation.refund_review", entityType: "donation", entityId: d.id, details: { amountCents, currency, paidCents: d.total_charged_cents, status: d.status } });
}

/**
 * A dispute (chargeback) opened or resolved: never changes a donation's status by itself, held for a person. An
 * opened dispute keeps the gift off s18A receipts until a person marks it charged back or releases the hold after
 * the dispute was won (each payment provider words the outcome its own way, so a person reads it).
 */
export async function handleDispute(reference: string | null, stage: "opened" | "resolved", detail: string | null, eventRowId: string): Promise<void> {
  const d = reference ? await findByReference(reference) : null;
  if (d && stage === "opened") {
    await holdReceipt(d.id, RECEIPT_HOLD.dispute);
    await pauseMonthlyFor(d.id);
  }
  await logAudit({
    actorUserId: null,
    action: stage === "opened" ? "donation.dispute_opened" : "donation.dispute_resolved",
    entityType: d ? "donation" : "gateway_event",
    entityId: d ? d.id : eventRowId,
    details: { reference, outcome: detail },
  });
  // A chargeback has a deadline for sending the provider evidence: tell the team now, not in tomorrow's list.
  if (stage === "opened") {
    await alertGivezy("a donor disputed a payment (chargeback)", [
      `The payment provider opened a dispute on payment ${reference ?? "(no reference)"}.${d ? " Any monthly donation it belongs to is paused." : " We could not match it to a donation."}`,
      "Answer it in the payment provider's dashboard before its deadline, with the charity's help if needed.",
    ]);
  }
}

/**
 * A platform admin, after the dispute was won: the gift may go on an s18A receipt again, and the monthly donation
 * stays paused while the donor may resume it again. Returns false when there was no hold to release. Logged.
 */
export async function releaseDisputeHold(donationId: string, actorUserId: string): Promise<boolean> {
  const db = createAdminClient();
  // Only the dispute's own reason is released: a refund still to check keeps the gift off receipts.
  const change = await changeHold(donationId, (reasons) => reasons.filter((r) => r !== RECEIPT_HOLD.dispute));
  const cleared = change && change.before.includes(RECEIPT_HOLD.dispute) ? [{ id: donationId }] : [];
  if (cleared.length) {
    await logAudit({ actorUserId, action: "donation.receipt_hold_cleared", entityType: "donation", entityId: donationId, details: { reason: RECEIPT_HOLD.dispute, stillHeldFor: change?.after ?? [] } });
  }
  const { data: d, error } = await db.from("donations").select("recurring_id").eq("id", donationId).maybeSingle();
  if (error) throw error;
  if (!d?.recurring_id) return Boolean(cleared?.length);
  const { data: released, error: releaseError } = await db
    .from("recurring_donations")
    .update({ held_reason: null })
    .eq("id", d.recurring_id)
    .not("held_reason", "is", null)
    .select("id");
  if (releaseError) throw releaseError;
  if (!released?.length) return Boolean(cleared?.length);
  await logAudit({ actorUserId, action: "recurring.hold_released", entityType: "recurring_donation", entityId: d.recurring_id as string, details: { donationId } });
  return true;
}

/**
 * A payment the provider took and gave back before Givezy confirmed it (held for a person by confirmPayment, review
 * 20/11/2026). A person checks the provider's dashboard, then closes it: the gift ends unpaid, nothing is owed, and it
 * is never counted as a declined card (no decline is recorded). The database only lets a waiting payment end as paid
 * or failed, so it is closed as failed, and the log says why. Only a payment still waiting is closed.
 */
export async function closeRefundedBeforeConfirm(donationId: string, actorUserId: string): Promise<"done" | "not_pending"> {
  const { data, error } = await createAdminClient()
    .from("donations")
    .update({ status: "failed", failed_at: new Date().toISOString() })
    .eq("id", donationId)
    .eq("status", "pending")
    .select("id");
  if (error) throw error;
  if (!data?.length) return "not_pending";
  await logAudit({ actorUserId, action: "donation.closed_refunded_before_confirm", entityType: "donation", entityId: donationId, details: { how: "closed by a platform admin: refunded before it was confirmed, nothing owed" } });
  return "done";
}
