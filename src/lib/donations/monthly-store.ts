import "server-only";
import { decrypt } from "@/lib/crypto";
import { confirmPayment } from "./confirm";
import { loadDonatableCharity } from "./charity";
import { getEmailTransport } from "@/lib/email";
import { formatRand } from "@/lib/money";
import { getGateway } from "@/lib/gateway";
import { isGatewayNotFound, isGatewayRefusal } from "@/lib/gateway/types";
import { platformConfig } from "@/config/platform";
import { legalConfig } from "@/config/legal";
import { createAdminClient } from "@/lib/supabase/admin";
import { runMonthlyCharges, type DueMonthly, type MonthlyDeps, type MonthlyStore, type MonthlySummary } from "./monthly-job";
import { monthlyFailedEmail } from "./monthly-email";
import { newCardLink, newCardPendingFor } from "./new-card";
import { DECLINED_REASON } from "./monthly-reasons";

type DueRow = {
  id: string;
  amount_cents: number;
  contribution_cents: number;
  charge_day: number;
  authorization_encrypted: string;
  card_last4: string | null;
  last_paid_period: string | null;
  attempt_period: string | null;
  failed_attempts: number;
  next_charge_at: string;
  first_donation_id: string;
  charities: { slug: string; name_en: string } | null;
};

function must<T>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (r.error || r.data === null || r.data === undefined) throw new Error(`Could not ${what}${r.error ? `: ${r.error.message}` : ""}`);
  return r.data as NonNullable<T>;
}

export function supabaseMonthlyStore(): MonthlyStore {
  const db = createAdminClient();
  return {
    async due(now, limit) {
      const gateway = getGateway();
      const rows = must(
        await db
          .from("recurring_donations")
          .select("id, amount_cents, contribution_cents, charge_day, authorization_encrypted, card_last4, last_paid_period, attempt_period, failed_attempts, next_charge_at, first_donation_id, charities(slug, name_en)")
          .eq("status", "active")
          .eq("gateway", gateway.name)
          .not("authorization_encrypted", "is", null)
          .lte("next_charge_at", now.toISOString())
          // Not one a run took in the last ten minutes, and the least recently tried first, so rows that
          // keep waiting (charity paused, card unreadable) cannot crowd out everyone else.
          .or(`last_attempt_at.is.null,last_attempt_at.lt.${new Date(now.getTime() - 10 * 60_000).toISOString()}`)
          .order("last_attempt_at", { ascending: true, nullsFirst: true })
          .order("next_charge_at")
          .limit(limit),
        "list the monthly donations that are due",
      ) as unknown as DueRow[];
      const out: DueMonthly[] = [];
      const unreadable: { id: string; message: string }[] = [];
      for (const r of rows) {
        const details = await db.from("donation_checkout_details").select("email").eq("donation_id", r.first_donation_id).maybeSingle();
        if (!r.charities || !details.data?.email) {
          unreadable.push({ id: r.id, message: "the donor's email or the charity could not be found" });
          await db.from("recurring_donations").update({ last_attempt_at: now.toISOString() }).eq("id", r.id);
          continue;
        }
        let authorizationCode: string;
        try {
          authorizationCode = decrypt(r.authorization_encrypted);
        } catch {
          unreadable.push({ id: r.id, message: "the stored card could not be read" });
          await db.from("recurring_donations").update({ last_attempt_at: now.toISOString() }).eq("id", r.id);
          continue;
        }
        out.push({
          id: r.id,
          charitySlug: r.charities.slug,
          charityName: r.charities.name_en,
          amountCents: Number(r.amount_cents),
          contributionCents: Number(r.contribution_cents),
          chargeDay: r.charge_day,
          authorizationCode,
          email: details.data.email as string,
          cardLast4: r.card_last4,
          lastPaidPeriod: r.last_paid_period,
          attemptPeriod: r.attempt_period,
          failedAttempts: r.failed_attempts,
          nextChargeAt: new Date(r.next_charge_at),
        });
      }
      return { rows: out, unreadable };
    },

    async claim(id, now) {
      // Only one run at a time takes a donation: ten minutes between claims.
      const cutoff = new Date(now.getTime() - 10 * 60_000).toISOString();
      const { data, error } = await db
        .from("recurring_donations")
        .update({ last_attempt_at: now.toISOString() })
        .eq("id", id)
        .eq("status", "active")
        .or(`last_attempt_at.is.null,last_attempt_at.lt.${cutoff}`)
        .select("id");
      if (error) throw new Error(`Could not claim a monthly donation: ${error.message}`);
      return (data ?? []).length > 0;
    },

    async attemptStatus(donationId) {
      const { data, error } = await db.from("donations").select("status, created_at").eq("id", donationId).maybeSingle();
      if (error) throw new Error(`Could not read a collection attempt: ${error.message}`);
      return data ? { status: data.status as string, createdAt: new Date(data.created_at as string) } : null;
    },

    async stillActive(id) {
      const { data, error } = await db.from("recurring_donations").select("status, authorization_encrypted").eq("id", id).maybeSingle();
      if (error) throw new Error(`Could not re-check a monthly donation: ${error.message}`);
      return data?.status === "active" && data.authorization_encrypted !== null;
    },

    async createAttempt(r, donationId, totalCents) {
      await createMonthlyGift(r.id, donationId, { amountCents: r.amountCents, contributionCents: r.contributionCents, totalCents });
    },

    async newCardPending(id, now) {
      return newCardPendingFor(id, now);
    },

    async reschedule(id, nextChargeAt) {
      const { error } = await db.from("recurring_donations").update({ next_charge_at: nextChargeAt.toISOString() }).eq("id", id).eq("status", "active");
      if (error) throw new Error(`Could not reschedule: ${error.message}`);
    },

    async recordPaid(id, period, nextChargeAt) {
      const { error } = await db
        .from("recurring_donations")
        .update({ last_paid_period: period, attempt_period: null, failed_attempts: 0, next_charge_at: nextChargeAt.toISOString() })
        .eq("id", id)
        .eq("status", "active");
      if (error) throw new Error(`Could not record a collected month: ${error.message}`);
    },

    async failAttempt(donationId) {
      const { error } = await db
        .from("donations")
        .update({ status: "failed", failed_at: new Date().toISOString() })
        .eq("id", donationId)
        .eq("status", "pending");
      if (error) throw new Error(`Could not record a refused attempt: ${error.message}`);
    },

    async recordFailure(id, period, failedAttempts, retryAt) {
      const patch = retryAt
        ? { attempt_period: period, failed_attempts: failedAttempts, next_charge_at: retryAt.toISOString() }
        : { attempt_period: period, failed_attempts: failedAttempts, status: "failed" as const, ended_reason: DECLINED_REASON, authorization_encrypted: null };
      // Never over a month that was paid meanwhile (a new card paid for it): a late failure must not stop the donation.
      const { error } = await db.from("recurring_donations").update(patch).eq("id", id).eq("status", "active").or(`last_paid_period.is.null,last_paid_period.neq.${period}`);
      if (error) throw new Error(`Could not record a failed attempt: ${error.message}`);
    },
  };
}

/**
 * One month's gift of a monthly donation, pending, with the donor's details, consent times and label
 * copied from its first gift. Used by the monthly job and by "Update my card".
 */
export async function createMonthlyGift(recurringId: string, donationId: string, m: { amountCents: number; contributionCents: number; totalCents: number }): Promise<void> {
  const db = createAdminClient();
  const rec = must(await db.from("recurring_donations").select("donor_id, charity_id, campaign_id, wants_18a, is_anonymous, message, dedication_kind, dedication_name, gateway, first_donation_id").eq("id", recurringId).maybeSingle(), "read the monthly donation");
  const first = must(await db.from("donations").select("popia_consent_at, age_confirmed_at, came_from").eq("id", rec.first_donation_id).maybeSingle(), "read the first donation");
  const ins = await db.from("donations").insert({
    id: donationId,
    donor_id: rec.donor_id,
    charity_id: rec.charity_id,
    campaign_id: rec.campaign_id,
    recurring_id: recurringId,
    amount_cents: m.amountCents,
    contribution_cents: m.contributionCents,
    platform_fee_cents: 0,
    fee_vat_cents: 0,
    processing_charge_cents: 0,
    total_charged_cents: m.totalCents,
    status: "pending",
    gateway: rec.gateway,
    gateway_ref: donationId,
    wants_18a: rec.wants_18a,
    is_anonymous: rec.is_anonymous,
    message: rec.message,
    // Each month carries the dedication the donor chose when they set it up.
    dedication_kind: rec.dedication_kind,
    dedication_name: rec.dedication_name,
    // Each month counts where the monthly donation was first set up (website, app, a shared link).
    came_from: first.came_from ?? null,
    popia_consent_at: first.popia_consent_at,
    age_confirmed_at: first.age_confirmed_at,
  });
  if (ins.error) throw new Error(`Could not create a collection attempt: ${ins.error.message}`);
  // The donor's details for the s18A receipt and their own record travel with each monthly gift. If
  // copying them fails, the attempt (not yet sent to the gateway) is removed again, so the next run
  // makes it afresh instead of charging a gift with no donor details.
  try {
    const details = must(await db.from("donation_checkout_details").select("*").eq("donation_id", rec.first_donation_id).maybeSingle(), "read the donor's details");
    const copy = await db.from("donation_checkout_details").insert({ ...details, donation_id: donationId });
    if (copy.error) throw new Error(`Could not copy the donor's details: ${copy.error.message}`);
    const kind = await db.from("donation_giving_kinds").select("kind, label").eq("donation_id", rec.first_donation_id).maybeSingle();
    if (kind.data) {
      const k = await db.from("donation_giving_kinds").insert({ donation_id: donationId, kind: kind.data.kind, label: kind.data.label });
      if (k.error) throw new Error(`Could not copy the donor's label: ${k.error.message}`);
    }
  } catch (e) {
    await db.from("donation_giving_kinds").delete().eq("donation_id", donationId);
    await db.from("donation_checkout_details").delete().eq("donation_id", donationId);
    await db.from("donations").delete().eq("id", donationId).eq("status", "pending");
    throw e;
  }
}

/** The real job: Supabase store, the active gateway, the confirmation check and email. */
export async function runMonthlyGiving(now = new Date(), deadline?: number): Promise<MonthlySummary> {
  const gateway = getGateway();
  const deps: MonthlyDeps = {
    deadline,
    store: supabaseMonthlyStore(),
    now,
    async charge({ reference, r, totalCents }) {
      // Checked again right before charging: the charity may have stopped taking donations since this run began.
      const charity = await loadDonatableCharity(r.charitySlug);
      if (!charity?.acceptingPayments) throw new Error("The charity is not taking donations right now, so nothing was charged.");
      await gateway.chargeAuthorization({
        reference,
        authorizationCode: r.authorizationCode,
        email: r.email,
        totalCents,
        lines: { charityCents: r.amountCents, contributionCents: r.contributionCents },
        charityAccountRef: charity?.splitAccountRef ?? null,
        feeBearer: platformConfig.fees.gatewayChargePaidBy,
        description: `Monthly donation to ${r.charityName}`,
      });
    },
    confirm: confirmPayment,
    isNotFound: isGatewayNotFound,
    isRefused: isGatewayRefusal,
    async charityState(slug) {
      return { accepting: Boolean((await loadDonatableCharity(slug))?.acceptingPayments) };
    },
    async notifyFailed(r, info) {
      const site = process.env.SITE_URL;
      const m = monthlyFailedEmail({
        charityName: r.charityName,
        totalText: formatRand(info.totalCents),
        cardLast4: r.cardLast4,
        final: info.final,
        manageUrl: site ? `${site.replace(/\/+$/, "")}/account` : undefined,
        newCardUrl: site ? newCardLink(site, r.id, now) : undefined,
        helpEmail: legalConfig.supportEmail,
      });
      await getEmailTransport().send({ to: r.email, ...m });
    },
  };
  return runMonthlyCharges(deps);
}
