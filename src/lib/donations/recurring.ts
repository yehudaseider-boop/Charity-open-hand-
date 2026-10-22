import "server-only";
import { encrypt } from "@/lib/crypto";
import type { VerifiedTransaction } from "@/lib/gateway/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { addMonths, chargeTime, periodOf } from "./schedule";

/** Thrown when the database refuses a write the monthly set-up needs, so the caller can retry. */
export class MonthlySetupError extends Error {
  constructor(what: string, cause?: unknown) {
    super(`Could not ${what}`, { cause });
    this.name = "MonthlySetupError";
  }
}

type Waiting = { id: string; charge_day: number };

/** Why a monthly donation is closed when its first payment is seen to fail. */
export const FIRST_PAYMENT_FAILED = "the first payment failed";
const NOT_REUSABLE = "this payment method cannot be charged again";

/**
 * The monthly donation whose first payment this is and which has not started. That includes one
 * closed only because the first payment looked failed: a payment can fail and then be paid on the
 * same hosted page, and the donor should then get the monthly donation they asked for.
 */
async function waitingFor(donationId: string): Promise<Waiting | null> {
  const { data, error } = await createAdminClient()
    .from("recurring_donations")
    .select("id, charge_day")
    .eq("first_donation_id", donationId)
    .or(`status.eq.pending,and(status.eq.cancelled,ended_reason.eq.${FIRST_PAYMENT_FAILED})`)
    .maybeSingle();
  if (error) throw new MonthlySetupError("read the monthly donation", error);
  return data as Waiting | null;
}

/**
 * The first payment of a monthly donation went through: keep the card authorisation (encrypted)
 * and schedule next month. Safe to run again. If the payment method cannot be charged again,
 * the monthly donation is not started (the first gift still stands) and this says so.
 */
export async function activateMonthlyDonation(donationId: string, tx: VerifiedTransaction): Promise<"activated" | "not_reusable" | "none"> {
  const waiting = await waitingFor(donationId);
  if (!waiting) return "none";
  const db = createAdminClient();
  const auth = tx.authorization;
  if (!auth || !auth.reusable) {
    const { data, error } = await db
      .from("recurring_donations")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), ended_reason: NOT_REUSABLE })
      .eq("id", waiting.id)
      .or(`status.eq.pending,and(status.eq.cancelled,ended_reason.eq.${FIRST_PAYMENT_FAILED})`)
      .select("id");
    if (error) throw new MonthlySetupError("close the monthly donation", error);
    return data?.length ? "not_reusable" : "none";
  }
  // An unreadable date from the provider falls back to now (as confirmPayment does), so it can never stop the
  // monthly donation from starting.
  const given = tx.paidAt ? new Date(tx.paidAt) : null;
  const paidAt = given && !Number.isNaN(given.getTime()) ? given : new Date();
  const period = periodOf(paidAt);
  const { data, error } = await db
    .from("recurring_donations")
    .update({
      status: "active",
      cancelled_at: null,
      ended_reason: null,
      authorization_encrypted: encrypt(auth.code),
      card_brand: auth.brand,
      card_last4: auth.last4,
      card_exp: auth.expires,
      last_paid_period: period,
      failed_attempts: 0,
      next_charge_at: chargeTime(addMonths(period, 1), waiting.charge_day).toISOString(),
    })
    .eq("id", waiting.id)
    .or(`status.eq.pending,and(status.eq.cancelled,ended_reason.eq.${FIRST_PAYMENT_FAILED})`)
    .select("id");
  if (error) throw new MonthlySetupError("start the monthly donation", error);
  // Zero rows: someone else started (or the donor cancelled) first. Nothing more to do or to email.
  return data?.length ? "activated" : "none";
}

/** The first payment failed: the monthly donation never starts. */
export async function cancelMonthlyBeforeStart(donationId: string, reason: string): Promise<void> {
  const waiting = await waitingFor(donationId);
  if (!waiting) return;
  const { error } = await createAdminClient()
    .from("recurring_donations")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), ended_reason: reason })
    .eq("id", waiting.id)
    .eq("status", "pending");
  if (error) throw new MonthlySetupError("close the monthly donation", error);
}

/**
 * Did another confirmation already handle this first payment's monthly set-up (started it, or closed
 * it because the card cannot be charged again)? Then that call sent the email and this one must not.
 */
export async function monthlyHandledElsewhere(donationId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("recurring_donations")
    .select("status, ended_reason")
    .eq("first_donation_id", donationId)
    .maybeSingle();
  if (error) throw new MonthlySetupError("read the monthly donation", error);
  return !!data && (data.status === "active" || data.ended_reason === NOT_REUSABLE);
}

/** Is this payment the first of a monthly donation that has not started yet? */
export async function monthlyWaitingFor(donationId: string): Promise<boolean> {
  return (await waitingFor(donationId)) !== null;
}
