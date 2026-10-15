import "server-only";
import { decrypt } from "@/lib/crypto";
import { confirmPayment } from "./confirm";
import { loadDonatableCharity } from "./charity";
import { getEmailTransport } from "@/lib/email";
import { formatRand } from "@/lib/money";
import { getGateway } from "@/lib/gateway";
import { isGatewayNotFound } from "@/lib/gateway/types";
import { platformConfig } from "@/config/platform";
import { createAdminClient } from "@/lib/supabase/admin";
import { runMonthlyCharges, type DueMonthly, type MonthlyDeps, type MonthlyStore, type MonthlySummary } from "./monthly-job";
import { monthlyFailedEmail } from "./monthly-email";

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
          .select("id, amount_cents, contribution_cents, charge_day, authorization_encrypted, card_last4, last_paid_period, attempt_period, failed_attempts, first_donation_id, charities(slug, name_en)")
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
      const rec = must(await db.from("recurring_donations").select("donor_id, charity_id, campaign_id, wants_18a, is_anonymous, message, dedication_kind, dedication_name, gateway, first_donation_id").eq("id", r.id).maybeSingle(), "read the monthly donation");
      const first = must(await db.from("donations").select("popia_consent_at, age_confirmed_at").eq("id", rec.first_donation_id).maybeSingle(), "read the first donation");
      const ins = await db.from("donations").insert({
        id: donationId,
        donor_id: rec.donor_id,
        charity_id: rec.charity_id,
        campaign_id: rec.campaign_id,
        recurring_id: r.id,
        amount_cents: r.amountCents,
        contribution_cents: r.contributionCents,
        platform_fee_cents: 0,
        fee_vat_cents: 0,
        processing_charge_cents: 0,
        total_charged_cents: totalCents,
        status: "pending",
        gateway: rec.gateway,
        gateway_ref: donationId,
        wants_18a: rec.wants_18a,
        is_anonymous: rec.is_anonymous,
        message: rec.message,
        // Each month carries the dedication the donor chose when they set it up.
        dedication_kind: rec.dedication_kind,
        dedication_name: rec.dedication_name,
        popia_consent_at: first.popia_consent_at,
        age_confirmed_at: first.age_confirmed_at,
      });
      if (ins.error) throw new Error(`Could not create a collection attempt: ${ins.error.message}`);
      // The donor's details for the s18A receipt and their own record travel with each monthly gift.
      const details = must(await db.from("donation_checkout_details").select("*").eq("donation_id", rec.first_donation_id).maybeSingle(), "read the donor's details");
      const copy = await db.from("donation_checkout_details").insert({ ...details, donation_id: donationId });
      if (copy.error) throw new Error(`Could not copy the donor's details: ${copy.error.message}`);
      const kind = await db.from("donation_giving_kinds").select("kind").eq("donation_id", rec.first_donation_id).maybeSingle();
      if (kind.data) {
        const k = await db.from("donation_giving_kinds").insert({ donation_id: donationId, kind: kind.data.kind });
        if (k.error) throw new Error(`Could not copy the giving choice: ${k.error.message}`);
      }
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

    async recordFailure(id, period, failedAttempts, retryAt) {
      const patch = retryAt
        ? { attempt_period: period, failed_attempts: failedAttempts, next_charge_at: retryAt.toISOString() }
        : { attempt_period: period, failed_attempts: failedAttempts, status: "failed" as const, ended_reason: "the card was declined every time we tried this month", authorization_encrypted: null };
      const { error } = await db.from("recurring_donations").update(patch).eq("id", id).eq("status", "active");
      if (error) throw new Error(`Could not record a failed attempt: ${error.message}`);
    },
  };
}

/** The real job: Supabase store, the active gateway, the confirmation check and email. */
export async function runMonthlyGiving(now = new Date()): Promise<MonthlySummary> {
  const gateway = getGateway();
  const deps: MonthlyDeps = {
    store: supabaseMonthlyStore(),
    now,
    async charge({ reference, r, totalCents }) {
      const charity = await loadDonatableCharity(r.charitySlug);
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
      });
      await getEmailTransport().send({ to: r.email, ...m });
    },
  };
  return runMonthlyCharges(deps);
}
