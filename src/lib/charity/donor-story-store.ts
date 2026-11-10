import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isErasedEmail } from "./dashboard";
import { emailHash } from "./thank-you";
import type { StoryRows } from "./donor-story";

/** Until a migration has run on a project there is no such table: that part of the story is simply empty. */
const isMissingTable = (e: { code?: string } | null | undefined) => e?.code === "PGRST205" || e?.code === "42P01";

const LIMIT = 500;

/**
 * Everything one charity has with one donor, for the donor's page. Service role, so call it only after the page has
 * checked the person manages this charity. Every read is filtered by this charity AND this donor (or by this
 * charity's own messages to this donor's addresses), so nothing of another charity, or another donor, is read.
 * Never reads message bodies, receipt details (they hold ID and tax numbers) or the charity's private notes on
 * receipt decisions.
 */
export async function loadDonorStory(charityId: string, donorId: string, notes: { created_at: string; author: string | null }[]): Promise<StoryRows> {
  const db = createAdminClient();
  const [donations, monthly, thanks, appeals, receipts, declined, enrolment] = await Promise.all([
    db
      .from("donations")
      .select("id, status, amount_cents, paid_at, created_at, recorded_method, recurring_id, donation_checkout_details(email, erased_at)")
      .eq("charity_id", charityId)
      .eq("donor_id", donorId)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    db.from("recurring_donations").select("id, status, amount_cents, paused_at, cancelled_at, updated_at, ended_reason").eq("charity_id", charityId).eq("donor_id", donorId).limit(LIMIT),
    db.from("charity_donor_thanks").select("kind, sent_at").eq("charity_id", charityId).eq("donor_id", donorId).order("sent_at", { ascending: false }).limit(LIMIT),
    db
      .from("charity_appeal_recipients")
      .select("status, claimed_at, sent_at, charity_appeals(subject, created_at)")
      .eq("charity_id", charityId)
      .eq("donor_id", donorId)
      .limit(LIMIT),
    db.from("s18a_receipts").select("receipt_number, tax_year, amount_cents, status, issued_at, voided_at, emailed_at").eq("charity_id", charityId).eq("donor_id", donorId).limit(LIMIT),
    db.from("receipt_plan_decisions").select("tax_year, decided_at, decline_emailed_at").eq("charity_id", charityId).eq("donor_id", donorId).eq("decision", "declined").limit(LIMIT),
    db.from("charity_journey_enrolments").select("id, enrolled_at, status, stopped_reason").eq("charity_id", charityId).eq("donor_id", donorId).maybeSingle(),
  ]);
  for (const r of [donations, monthly, thanks, appeals, receipts, declined]) if (r.error) throw r.error;
  if (enrolment.error && !isMissingTable(enrolment.error)) throw enrolment.error;

  type DonationRow = { id: string; status: string; amount_cents: number | string; paid_at: string | null; created_at: string; recorded_method: string | null; recurring_id: string | null; donation_checkout_details: unknown };
  const rows = (donations.data ?? []) as DonationRow[];

  // When each monthly donation first went through: the dashboard counts a monthly donation only once it has.
  const firstPaid = new Map<string, string>();
  for (const d of rows) {
    if (!d.recurring_id || !d.paid_at || !["paid", "refunded", "charged_back"].includes(d.status)) continue;
    const had = firstPaid.get(d.recurring_id);
    if (!had || d.paid_at < had) firstPaid.set(d.recurring_id, d.paid_at);
  }

  // The monthly thank-you goes by address (kept only as a hash): this donor's addresses on their gifts to this charity.
  const hashes = new Set<string>();
  for (const d of rows) {
    const raw = d.donation_checkout_details;
    const c = (Array.isArray(raw) ? raw[0] : raw) as { email: string | null; erased_at: string | null } | null;
    if (c?.email && !c.erased_at && !isErasedEmail(c.email)) hashes.add(emailHash(c.email));
  }
  let monthThanks: StoryRows["monthThanks"] = [];
  if (hashes.size) {
    const { data: months, error } = await db.from("charity_thank_yous").select("id, period_month").eq("charity_id", charityId).order("sent_at", { ascending: false }).limit(120);
    if (error) throw error;
    const byId = new Map((months ?? []).map((m) => [m.id as string, m.period_month as string]));
    if (byId.size) {
      const { data, error: e } = await db
        .from("charity_thank_you_recipients")
        .select("thank_you_id, status, claimed_at")
        .in("thank_you_id", [...byId.keys()])
        .in("email_hash", [...hashes].slice(0, 50))
        .limit(LIMIT);
      if (e) throw e;
      // One donor with two addresses can be on the same month twice: show it once, the best outcome first.
      const best = new Map<string, { period_month: string; status: string; at: string }>();
      const rank = (s: string) => (s === "sent" ? 0 : s === "sending" ? 1 : 2);
      for (const r of data ?? []) {
        const key = r.thank_you_id as string;
        const had = best.get(key);
        if (!had || rank(r.status as string) < rank(had.status)) best.set(key, { period_month: byId.get(key)!, status: r.status as string, at: r.claimed_at as string });
      }
      monthThanks = [...best.values()];
    }
  }

  let journey: StoryRows["journey"] = null;
  if (enrolment.data) {
    const { data, error } = await db
      .from("charity_journey_sends")
      .select("position, status, created_at, sent_at")
      .eq("charity_id", charityId)
      .eq("enrolment_id", enrolment.data.id as string)
      .limit(20);
    if (error && !isMissingTable(error)) throw error;
    journey = {
      enrolled_at: enrolment.data.enrolled_at as string,
      status: enrolment.data.status as string,
      stopped_reason: enrolment.data.stopped_reason as string | null,
      sends: (data ?? []).map((s) => ({ position: Number(s.position), status: s.status as string, at: (s.sent_at ?? s.created_at) as string })),
    };
  }

  return {
    gifts: rows.map((d) => ({ id: d.id, status: d.status, amount_cents: Number(d.amount_cents), paid_at: d.paid_at, created_at: d.created_at, recorded_method: d.recorded_method })),
    monthly: (monthly.data ?? []).map((m) => ({
      id: m.id as string,
      status: m.status as string,
      amount_cents: Number(m.amount_cents),
      first_paid_at: firstPaid.get(m.id as string) ?? null,
      ended_at: m.status === "cancelled" || m.status === "failed" ? ((m.cancelled_at ?? m.updated_at) as string) : null,
      paused_at: m.paused_at as string | null,
      ended_reason: m.ended_reason as string | null,
    })),
    thanks: (thanks.data ?? []).map((t) => ({ kind: (t.kind as string) ?? "thank_you", sent_at: t.sent_at as string })),
    appeals: (appeals.data ?? []).map((a) => {
      const raw = a.charity_appeals as unknown;
      const appeal = (Array.isArray(raw) ? raw[0] : raw) as { subject: string | null; created_at: string | null } | null;
      return { subject: appeal?.subject ?? null, status: a.status as string, at: (a.sent_at ?? a.claimed_at ?? appeal?.created_at ?? null) as string | null };
    }),
    monthThanks,
    journey,
    receipts: (receipts.data ?? []).map((r) => ({
      receipt_number: Number(r.receipt_number),
      tax_year: Number(r.tax_year),
      amount_cents: Number(r.amount_cents),
      status: r.status as string,
      issued_at: r.issued_at as string,
      voided_at: r.voided_at as string | null,
      emailed_at: r.emailed_at as string | null,
    })),
    declined: (declined.data ?? []).map((d) => ({ tax_year: Number(d.tax_year), decided_at: d.decided_at as string, decline_emailed_at: d.decline_emailed_at as string | null })),
    notes,
  };
}
