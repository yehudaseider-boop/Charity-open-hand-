import "server-only";
import { encrypt, signLink } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";
import { alertGivezy } from "@/lib/ops/alert";
import { getGateway } from "@/lib/gateway";
import type { VerifiedTransaction } from "@/lib/gateway/types";
import { GatewayError } from "@/lib/gateway/types";
import { legalConfig } from "@/config/legal";
import { platformConfig } from "@/config/platform";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadDonatableCharity } from "./charity";
import { issueConfirmationToken } from "./confirmation-access";
import { createMonthlyGift } from "./monthly-store";
import { addMonths, chargeTime, periodOf, type Period } from "./schedule";

/**
 * "Update my card" for a monthly donation whose card was declined. The donor pays this month's donation
 * with a new card on the payment provider's own page; once the provider confirms it, that card is kept for
 * the same monthly donation, which carries on (or starts again, if it had stopped after three tries).
 *
 * Who may: the signed-in donor it belongs to, or whoever holds the signed link from the "we could not
 * collect" email (it is for that one monthly donation and lasts 30 days). Never a way to change the amount
 * or the charity: those stay as the donor set them up.
 */

const LINK_DAYS = 30;
/** While a new-card payment page may still be paid, the monthly job leaves the old card alone. */
const PENDING_HOLD_MS = 48 * 3_600_000;
/** A new-card payment page opened this recently may still be paid: no second one meanwhile. */
const NEW_CARD_PAGE_MS = 30 * 60_000;
/** A try of the old card takes seconds; two minutes after the job took the row, it has been recorded. */
const JOB_BUSY_MS = 2 * 60_000;
export const DECLINED_REASON = "the card was declined every time we tried this month";
export const NEW_CARD_NOT_REUSABLE = "the new card can't be used for monthly payments";

const purpose = "monthly-new-card";

/** The donor's own link to "Update my card", on this site (signed, for this monthly donation only). */
export function newCardPath(recurringId: string, now: Date): string {
  const expires = Math.floor(now.getTime() / 1000) + LINK_DAYS * 86_400;
  const sig = signLink(purpose, `${recurringId}.${expires}`);
  return `/monthly/new-card?m=${recurringId}&e=${expires}&s=${sig}`;
}

/** The same link in full, for the email. */
export function newCardLink(site: string, recurringId: string, now: Date): string {
  return `${site.replace(/\/+$/, "")}${newCardPath(recurringId, now)}`;
}

/** Was this gift a card update? Then which monthly donation, and when it is next collected. */
export async function cardUpdateFor(donationId: string): Promise<{ recurringId: string; nextChargeAt: Date | null; active: boolean } | null> {
  const db = createAdminClient();
  const { data, error } = await db.from("monthly_card_updates").select("recurring_id").eq("donation_id", donationId).maybeSingle();
  if (error) throw new Error(`Could not read the card update: ${error.message}`);
  if (!data) return null;
  const r = await db.from("recurring_donations").select("status, next_charge_at").eq("id", data.recurring_id).maybeSingle();
  return { recurringId: data.recurring_id, nextChargeAt: r.data?.next_charge_at ? new Date(r.data.next_charge_at) : null, active: r.data?.status === "active" };
}

/** A link we signed, for this monthly donation, not yet expired. */
export function newCardLinkValid(m: string, e: string, s: string, now: Date): boolean {
  if (!/^[0-9a-f-]{36}$/i.test(m) || !/^[0-9]{1,12}$/.test(e) || !/^[A-Za-z0-9_-]{43}$/.test(s)) return false;
  if (Number(e) * 1000 < now.getTime()) return false;
  const want = signLink(purpose, `${m}.${e}`);
  // Same length always (both are base64url SHA-256), so a plain compare in constant time:
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ s.charCodeAt(i);
  return diff === 0;
}

/** Is this monthly donation the signed-in person's own? */
export async function ownsMonthly(userId: string, recurringId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(recurringId)) return false;
  const { data, error } = await createAdminClient().from("recurring_donations").select("id, donors!inner(user_id)").eq("id", recurringId).eq("donors.user_id", userId).maybeSingle();
  if (error) throw new Error(`Could not read the monthly donation: ${error.message}`);
  return data !== null;
}

export type NewCardOffer =
  | {
      ok: true;
      recurringId: string;
      charityName: string;
      charitySlug: string;
      amountCents: number;
      contributionCents: number;
      totalCents: number;
      cardLast4: string | null;
      /** It had stopped after three tries (rather than still being tried). */
      stopped: boolean;
      /** The month this payment pays for. */
      period: Period;
      /** When the new card is next charged, if this payment goes through. */
      nextChargeAt: Date;
    }
  | { ok: false; reason: NotOffered };

type Row = {
  id: string;
  status: string;
  amount_cents: number | string;
  contribution_cents: number | string;
  card_last4: string | null;
  charge_day: number;
  last_paid_period: string | null;
  attempt_period: string | null;
  failed_attempts: number;
  last_attempt_at: string | null;
  ended_reason: string | null;
  first_donation_id: string | null;
  charities: { slug: string; name_en: string } | null;
};

async function readMonthly(recurringId: string): Promise<Row | null> {
  const { data, error } = await createAdminClient()
    .from("recurring_donations")
    .select("id, status, amount_cents, contribution_cents, card_last4, charge_day, last_paid_period, attempt_period, failed_attempts, last_attempt_at, ended_reason, first_donation_id, charities(slug, name_en)")
    .eq("id", recurringId)
    .maybeSingle();
  if (error) throw new Error(`Could not read the monthly donation: ${error.message}`);
  return data as unknown as Row | null;
}

/** A new card is wanted: the card was declined this month (still being tried, or stopped after three tries). */
export function needsNewCard(r: Pick<Row, "status" | "failed_attempts" | "attempt_period" | "last_paid_period" | "ended_reason">, now: Date): boolean {
  const current = periodOf(now);
  if (r.last_paid_period === current) return false;
  if (r.status === "active") return r.failed_attempts > 0 && r.attempt_period !== null && r.attempt_period !== r.last_paid_period;
  return r.status === "failed" && (r.ended_reason === DECLINED_REASON || r.ended_reason === NEW_CARD_NOT_REUSABLE);
}

/** Something about this monthly donation's payments is still unsettled (a try in progress, a page not yet paid). */
async function busy(r: Row, now: Date): Promise<boolean> {
  // The monthly job may be trying the old card this very moment (it has taken the row but not yet recorded
  // the try). Only while it is still collecting: a stopped one is never tried again.
  if (r.status === "active" && r.last_attempt_at && now.getTime() - new Date(r.last_attempt_at).getTime() < JOB_BUSY_MS) return true;
  // A try of the old card that the payment provider hasn't settled yet. (An earlier new-card page the donor closed
  // without paying doesn't count: they may simply try again.)
  const db = createAdminClient();
  const { data, error } = await db
    .from("donations")
    .select("id")
    .eq("recurring_id", r.id)
    .eq("status", "pending")
    .neq("id", r.first_donation_id ?? "00000000-0000-0000-0000-000000000000")
    .gte("created_at", new Date(now.getTime() - PENDING_HOLD_MS).toISOString());
  if (error) throw new Error(`Could not check the monthly donation's payments: ${error.message}`);
  const pending = (data ?? []).map((d) => d.id as string);
  if (pending.length === 0) return false;
  const updates = await db.from("monthly_card_updates").select("donation_id, created_at").in("donation_id", pending);
  if (updates.error) throw new Error(`Could not check the monthly donation's payments: ${updates.error.message}`);
  const ours = new Map((updates.data ?? []).map((u) => [u.donation_id as string, new Date(u.created_at as string)]));
  return pending.some((id) => {
    const opened = ours.get(id);
    // A try of the old card; or a new-card page opened in the last half hour, which may be paid any moment
    // (a second page now could charge this month twice). Older pages were most likely closed unpaid.
    return !opened || now.getTime() - opened.getTime() < NEW_CARD_PAGE_MS;
  });
}

/** What "Update my card" would do for this monthly donation now, or why it isn't offered. */
export async function loadNewCardOffer(recurringId: string, now: Date): Promise<NewCardOffer> {
  const r = await readMonthly(recurringId);
  if (!r || !r.charities || !r.first_donation_id || r.status === "cancelled") return { ok: false, reason: "gone" };
  if (!needsNewCard(r, now)) return { ok: false, reason: "not_needed" };
  const charity = await loadDonatableCharity(r.charities.slug);
  if (!charity?.acceptingPayments) return { ok: false, reason: "charity_closed" };
  if (await busy(r, now)) return { ok: false, reason: "busy" };
  // This month, always: a month that was skipped is never collected late (as in the monthly job).
  const period = periodOf(now);
  const amountCents = Number(r.amount_cents);
  const contributionCents = Number(r.contribution_cents ?? 0);
  return {
    ok: true,
    recurringId: r.id,
    charityName: r.charities.name_en,
    charitySlug: r.charities.slug,
    amountCents,
    contributionCents,
    totalCents: amountCents + contributionCents,
    cardLast4: r.card_last4,
    stopped: r.status === "failed",
    period,
    nextChargeAt: chargeTime(addMonths(period, 1), r.charge_day),
  };
}

/**
 * Start the payment with a new card: a pending gift for this month, marked as a card update, and the payment
 * provider's page. Nothing is charged and nothing changes until the provider confirms the payment.
 */
export async function startNewCardPayment(recurringId: string, now: Date, opts: { fromApp?: boolean } = {}): Promise<{ ok: true; redirectUrl: string } | { ok: false; reason: NotOffered | "gateway" }> {
  const offer = await loadNewCardOffer(recurringId, now);
  if (!offer.ok) return { ok: false, reason: offer.reason };
  const db = createAdminClient();
  const r = await readMonthly(recurringId);
  const first = r?.first_donation_id ? await db.from("donation_checkout_details").select("email").eq("donation_id", r.first_donation_id).maybeSingle() : null;
  const email = first?.data?.email as string | undefined;
  if (!email) return { ok: false, reason: "gone" };
  const charity = await loadDonatableCharity(offer.charitySlug);
  if (!charity?.acceptingPayments) return { ok: false, reason: "charity_closed" };

  const donationId = crypto.randomUUID();
  await createMonthlyGift(recurringId, donationId, { amountCents: offer.amountCents, contributionCents: offer.contributionCents, totalCents: offer.totalCents });
  // From here, anything that goes wrong closes this gift as failed (nothing was charged), so it never holds
  // the monthly donation up.
  try {
    const marked = await db.from("monthly_card_updates").insert({ donation_id: donationId, recurring_id: recurringId, period: offer.period });
    if (marked.error) throw new Error(`Could not record the card update: ${marked.error.message}`);
    // What the donor agrees to by paying with the new card: the same amount every month until they cancel.
    const consent = await db.from("consents").insert({ kind: "monthly_authorisation", policy_version: legalConfig.policyVersion, donation_id: donationId });
    if (consent.error) throw new Error(`Could not record the authorisation: ${consent.error.message}`);
    const token = await issueConfirmationToken(donationId);
    const site = process.env.SITE_URL ?? "";
    const { redirectUrl } = await getGateway().createCheckout({
      reference: donationId,
      totalCents: offer.totalCents,
      lines: { charityCents: offer.amountCents, contributionCents: offer.contributionCents },
      charityAccountRef: charity.splitAccountRef,
      feeBearer: platformConfig.fees.gatewayChargePaidBy,
      email,
      saveCard: true,
      returnUrl: `${site}/donate/return?reference=${donationId}&t=${token}${opts.fromApp ? "&from=app" : ""}`,
      description: `Monthly donation to ${offer.charityName}`,
    });
    return { ok: true, redirectUrl };
  } catch (e) {
    await db.from("donations").update({ status: "failed", failed_at: new Date().toISOString() }).eq("id", donationId).eq("status", "pending");
    if (e instanceof GatewayError) {
      console.error(e);
      return { ok: false, reason: "gateway" };
    }
    throw e;
  }
}

export type NotOffered = "not_needed" | "busy" | "charity_closed" | "gone";

/** Plain words for each reason "Update my card" isn't offered or couldn't start. */
export function offerMessage(reason: NotOffered | "gateway"): string {
  switch (reason) {
    case "gateway":
      return "The payment page could not be opened just now. Nothing was charged and your monthly donation is unchanged. Please try again in a few minutes.";
    case "not_needed":
      return "Your monthly donation is up to date, so there is no card to update right now.";
    case "busy":
      return "A payment for this monthly donation is still going through. Nothing more was charged. Please check again in an hour.";
    case "charity_closed":
      return "This charity can't take online donations right now, so nothing can be charged. Your monthly donation is unchanged.";
    case "gone":
      return "We couldn't find this monthly donation. It may have been cancelled.";
  }
}

/** Is this paid gift a card update whose card hasn't been kept yet? */
export async function newCardWaitingFor(donationId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from("monthly_card_updates").select("donation_id").eq("donation_id", donationId).is("finished_at", null).maybeSingle();
  if (error) throw new Error(`Could not read the card update: ${error.message}`);
  return data !== null;
}

/** A new-card payment page for this monthly donation may still be paid: the monthly job must not try the old card. */
export async function newCardPendingFor(recurringId: string, now: Date): Promise<boolean> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("monthly_card_updates")
    .select("donation_id, donations!inner(status)")
    .eq("recurring_id", recurringId)
    .is("finished_at", null)
    .eq("donations.status", "pending")
    .gte("created_at", new Date(now.getTime() - PENDING_HOLD_MS).toISOString())
    .limit(1);
  if (error) throw new Error(`Could not check for a card update: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * The new-card payment went through: keep the card for the monthly donation, count this month as paid and
 * carry on from next month. Safe to run again (once done, the update is marked finished). A donor who
 * cancelled since keeps their cancellation: the gift stands, the card is not kept.
 */
export async function finishNewCard(donationId: string, tx: VerifiedTransaction): Promise<"updated" | "not_reusable" | "none"> {
  const db = createAdminClient();
  const { data: upd, error } = await db.from("monthly_card_updates").select("recurring_id, period").eq("donation_id", donationId).is("finished_at", null).maybeSingle();
  if (error) throw new Error(`Could not read the card update: ${error.message}`);
  if (!upd) return "none";
  const r = await readMonthly(upd.recurring_id);
  let result: "updated" | "not_reusable" | "none" = "none";
  if (r && (r.status === "active" || r.status === "failed")) {
    if (r.last_paid_period === upd.period) {
      // Paid twice for one month (the old card went through after all, or two pages were paid): a person refunds one.
      await logAudit({ actorUserId: null, action: "monthly.paid_twice", entityType: "donation", entityId: donationId, details: { recurring: r.id, period: upd.period } });
      await alertGivezy("a monthly donation was paid twice", [
        `A monthly donation was paid twice for ${upd.period}: once with the old card and once with the new one, or with two new-card pages.`,
        "Refund one of the two payments in the payment provider's dashboard, then mark it refunded in Admin, Payments.",
      ]);
    }
    const auth = tx.authorization;
    const reusable = Boolean(auth && auth.reusable);
    const next = chargeTime(addMonths(upd.period, 1), r.charge_day).toISOString();
    const patch = reusable
      ? {
          status: "active" as const,
          ended_reason: null,
          cancelled_at: null,
          authorization_encrypted: encrypt(auth!.code),
          card_brand: auth!.brand,
          card_last4: auth!.last4,
          card_exp: auth!.expires,
          last_paid_period: upd.period,
          attempt_period: null,
          failed_attempts: 0,
          next_charge_at: next,
        }
      : // The month is paid, but this card can't be charged again, and the old one was declined: stop, so
        // nothing more is tried. The donor can put in another card from the same link or their account.
        { last_paid_period: upd.period, status: "failed" as const, ended_reason: NEW_CARD_NOT_REUSABLE, authorization_encrypted: null };
    const saved = await db.from("recurring_donations").update(patch).eq("id", r.id).in("status", ["active", "failed"]);
    if (saved.error) throw new Error(`Could not keep the new card: ${saved.error.message}`);
    result = reusable ? "updated" : "not_reusable";
  }
  const done = await db.from("monthly_card_updates").update({ finished_at: new Date().toISOString() }).eq("donation_id", donationId);
  if (done.error) throw new Error(`Could not close the card update: ${done.error.message}`);
  return result;
}
