import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isErasedEmail } from "./dashboard";
import { emailHash } from "./thank-you";
import type { StoryRows } from "./donor-story";

/** Until a migration has run on a project there is no such table: that part of the story is simply empty. */
const isMissingTable = (e: { code?: string } | null | undefined) => e?.code === "PGRST205" || e?.code === "42P01";
/** A table or a column a newer migration adds, not yet run on this project: that part of the story is empty. */
const isNotSetUp = (e: { code?: string } | null | undefined) => isMissingTable(e) || e?.code === "42703" || e?.code === "PGRST204";

/** Gifts that really happened: only their addresses can have received the charity's monthly thank-you. */
const COUNTED = ["paid", "refunded", "charged_back"];

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
  const [donations, monthly, thanksWithKind, appeals, receipts, declinedRead, enrolment, donorRow] = await Promise.all([
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
    db.from("charity_journey_enrolments").select("id, enrolled_at, status, stopped_reason, journey:charity_journeys(kind, campaign_id)").eq("charity_id", charityId).eq("donor_id", donorId).limit(20),
    db.from("donors").select("email").eq("id", donorId).maybeSingle(),
  ]);
  for (const r of [donations, monthly, appeals, receipts, donorRow]) if (r.error) throw r.error;
  // Before the journeys had kinds (20261110000011) a donor has the one general journey: read it without the kind.
  let enrolments = (enrolment.data ?? []) as { id: string; enrolled_at: string; status: string; stopped_reason: string | null; journey?: unknown }[];
  if (enrolment.error) {
    if (isMissingTable(enrolment.error)) enrolments = [];
    else if (isNotSetUp(enrolment.error)) {
      const plain = await db.from("charity_journey_enrolments").select("id, enrolled_at, status, stopped_reason").eq("charity_id", charityId).eq("donor_id", donorId).limit(20);
      if (plain.error && !isMissingTable(plain.error)) throw plain.error;
      enrolments = plain.error ? [] : ((plain.data ?? []) as typeof enrolments);
    } else throw enrolment.error;
  }
  // Receipt decisions (20261110000001) may not be on this project yet: then there are none to show.
  if (declinedRead.error && !isNotSetUp(declinedRead.error)) throw declinedRead.error;
  const declined = declinedRead.error ? [] : (declinedRead.data ?? []);
  // The kind of message (20261110000002) may not be on this project yet: then every row is a personal thank-you.
  let thanks = (thanksWithKind.data ?? []) as { kind?: string | null; sent_at: string }[];
  if (thanksWithKind.error) {
    if (!isNotSetUp(thanksWithKind.error)) throw thanksWithKind.error;
    const plain = await db.from("charity_donor_thanks").select("sent_at").eq("charity_id", charityId).eq("donor_id", donorId).order("sent_at", { ascending: false }).limit(LIMIT);
    if (plain.error && !isNotSetUp(plain.error)) throw plain.error;
    thanks = plain.error ? [] : ((plain.data ?? []) as { sent_at: string }[]);
  }

  type DonationRow = { id: string; status: string; amount_cents: number | string; paid_at: string | null; created_at: string; recorded_method: string | null; recurring_id: string | null; donation_checkout_details: unknown };
  const rows = (donations.data ?? []) as DonationRow[];

  // When each monthly donation first went through: the dashboard counts a monthly donation only once it has.
  const firstPaid = new Map<string, string>();
  for (const d of rows) {
    if (!d.recurring_id || !d.paid_at || !COUNTED.includes(d.status)) continue;
    const had = firstPaid.get(d.recurring_id);
    if (!had || d.paid_at < had) firstPaid.set(d.recurring_id, d.paid_at);
  }

  // The monthly thank-you goes by address (kept only as a hash): this donor's own address and the addresses on their
  // gifts to this charity that went through. A failed or abandoned checkout may carry a mistyped or someone else's
  // address, so it never counts.
  const hashes = new Set<string>();
  const own = (donorRow.data as { email?: string | null } | null)?.email;
  if (own && !isErasedEmail(own)) hashes.add(emailHash(own));
  for (const d of rows) {
    if (!COUNTED.includes(d.status)) continue;
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

  const journeys: StoryRows["journeys"] = [];
  if (enrolments.length) {
    const { data, error } = await db
      .from("charity_journey_sends")
      .select("enrolment_id, position, status, created_at, sent_at")
      .eq("charity_id", charityId)
      .in("enrolment_id", enrolments.map((e) => e.id))
      .limit(100);
    if (error && !isMissingTable(error)) throw error;
    const kindOf = (e: (typeof enrolments)[number]) => {
      const raw = e.journey as unknown;
      const j = (Array.isArray(raw) ? raw[0] : raw) as { kind?: string; campaign_id?: string | null } | null | undefined;
      return { kind: (j?.kind === "campaign" || j?.kind === "winback" ? j.kind : "general") as "general" | "campaign" | "winback", campaignId: j?.campaign_id ?? null };
    };
    const campaignIds = [...new Set(enrolments.map((e) => kindOf(e).campaignId).filter((x): x is string => Boolean(x)))];
    const titles = new Map<string, string>();
    if (campaignIds.length) {
      const { data: cs, error: ce } = await db.from("campaigns").select("id, title").eq("charity_id", charityId).in("id", campaignIds);
      if (ce) throw ce;
      for (const c of cs ?? []) titles.set(c.id as string, c.title as string);
    }
    for (const e of enrolments) {
      const k = kindOf(e);
      journeys.push({
        kind: k.kind,
        campaignId: k.campaignId,
        campaignTitle: k.campaignId ? (titles.get(k.campaignId) ?? null) : null,
        enrolled_at: e.enrolled_at,
        status: e.status,
        stopped_reason: e.stopped_reason,
        sends: (data ?? [])
          .filter((s) => (s.enrolment_id ?? e.id) === e.id)
          .map((s) => ({ position: Number(s.position), status: s.status as string, at: (s.sent_at ?? s.created_at) as string })),
      });
    }
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
    thanks: thanks.map((t) => ({ kind: t.kind ?? "thank_you", sent_at: t.sent_at })),
    appeals: (appeals.data ?? []).map((a) => {
      const raw = a.charity_appeals as unknown;
      const appeal = (Array.isArray(raw) ? raw[0] : raw) as { subject: string | null; created_at: string | null } | null;
      return { subject: appeal?.subject ?? null, status: a.status as string, at: (a.sent_at ?? a.claimed_at ?? appeal?.created_at ?? null) as string | null };
    }),
    monthThanks,
    journeys,
    receipts: (receipts.data ?? []).map((r) => ({
      receipt_number: Number(r.receipt_number),
      tax_year: Number(r.tax_year),
      amount_cents: Number(r.amount_cents),
      status: r.status as string,
      issued_at: r.issued_at as string,
      voided_at: r.voided_at as string | null,
      emailed_at: r.emailed_at as string | null,
    })),
    declined: declined.map((d) => ({ tax_year: Number(d.tax_year), decided_at: d.decided_at as string, decline_emailed_at: d.decline_emailed_at as string | null })),
    notes,
  };
}
