import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MonthlyRow, Period } from "./dashboard";
import { readAllPages } from "./read-pages";
import { leftCents } from "@/lib/donations/what-is-left";
import { platformConfig } from "@/config/platform";
import { taxYearFor } from "@/lib/dates";
import { annualReport, pickReportYear, reportFromSummary, reportYears, toReportSummary, type AnnualReport } from "./annual-report";
import { isMissingFunctionNamed } from "./keeping-donors-queries";

/** Everything here is read as the signed-in person, so row-level security decides what comes back. */

export type Overview = {
  paid_count: number;
  paid_cents: number;
  donor_count: number;
  receipt_requested_cents: number;
  refunded_count: number;
  refunded_cents: number;
  charged_back_count: number;
  pending_count: number;
  failed_count: number;
};

const n = (v: unknown) => Number(v ?? 0);

export async function loadOverview(charityId: string, period: Period): Promise<Overview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("charity_overview", { p_charity_id: charityId, p_from: period.from, p_to: period.to });
  if (error) throw new Error(error.message);
  const r = (Array.isArray(data) ? data[0] : data) ?? {};
  return {
    paid_count: n(r.paid_count),
    paid_cents: n(r.paid_cents),
    donor_count: n(r.donor_count),
    receipt_requested_cents: n(r.receipt_requested_cents),
    refunded_count: n(r.refunded_count),
    refunded_cents: n(r.refunded_cents),
    charged_back_count: n(r.charged_back_count),
    pending_count: n(r.pending_count),
    failed_count: n(r.failed_count),
  };
}

export async function loadMonthlyTotals(charityId: string, months = 12) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("charity_monthly_totals", { p_charity_id: charityId, p_months: months });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { month: string; donation_count: number; amount_cents: number; monthly_cents: number }[]).map((r) => ({
    month: r.month,
    donationCount: n(r.donation_count),
    amountCents: n(r.amount_cents),
    /** The part that came from monthly donations; the rest was once-off. */
    monthlyCents: n(r.monthly_cents),
  }));
}

export type DonorRow = {
  donor_id: string;
  donor_type: string;
  display_name: string;
  /** Null when the viewer's role can't see contact details (charity_contact_or_null). */
  email: string | null;
  phone: string | null;
  donation_count: number;
  total_cents: number;
  first_paid_at: string;
  last_paid_at: string;
  wants_18a: boolean;
  is_anonymous: boolean;
};

export async function loadDonors(charityId: string): Promise<DonorRow[]> {
  const supabase = await createClient();
  // The database answers at most 1 000 rows at a time, so a long list is read page by page, a few pages at once.
  // The database's own order (largest total, then latest gift), with the donor id last so the order is unique and no
  // donor repeats or goes missing between pages.
  const rows = await readAllPages<DonorRow>((from, to, count) =>
    supabase
      .rpc("charity_donor_list", { p_charity_id: charityId }, count ? { count: "exact" } : undefined)
      .order("total_cents", { ascending: false })
      .order("last_paid_at", { ascending: false })
      .order("donor_id")
      .range(from, to) as unknown as PromiseLike<{ data: DonorRow[] | null; error: { message: string } | null; count?: number | null }>,
  );
  return rows.map((d) => ({ ...d, donation_count: n(d.donation_count), total_cents: n(d.total_cents) }));
}

/** The charity's monthly donations, read through `charity_monthly_list` (no card or gateway details). */
export async function loadMonthlyDonations(charityId: string): Promise<MonthlyRow[]> {
  const supabase = await createClient();
  const rows: MonthlyRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.rpc("charity_monthly_list", { p_charity_id: charityId }).range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as MonthlyRow[]));
    if (!data || data.length < 1000) break;
  }
  return rows.map((r) => ({ ...r, amount_cents: n(r.amount_cents), paid_count: n(r.paid_count), paid_cents: n(r.paid_cents) }));
}

/** Rows of `charity_donations` (paid, refunded or charged back), read page by page. */
async function allCharityDonations<T>(charityId: string, fields: string, narrow: (q: any) => any = (q) => q): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const supabase = await createClient();
  return readAllPages<T>((from, to, count) =>
    narrow(supabase.from("charity_donations").select(fields, count ? { count: "exact" } : undefined).eq("charity_id", charityId)).order("id").range(from, to),
  );
}

/** Refunds and chargebacks since a moment (by when they were refunded or charged back), for "Needs you this week". */
export function loadReversalsSince(charityId: string, since: string) {
  return allCharityDonations<{ status: string; amount_cents: number | string; refunded_at: string | null; charged_back_at: string | null }>(
    charityId,
    "status, amount_cents, refunded_at, charged_back_at",
    (q) => q.in("status", ["refunded", "charged_back"]).or(`refunded_at.gte.${since},charged_back_at.gte.${since}`),
  );
}

/** Each donor's monthly payments, to mark who gives monthly on the donor list. */
export function loadMonthlyGifts(charityId: string) {
  return allCharityDonations<{ donor_id: string; recurring_id: string | null }>(charityId, "donor_id, recurring_id", (q) => q.not("recurring_id", "is", null));
}

/**
 * Paid gifts that asked for an s18A receipt, and which of them are on an issued receipt. Each carries what was
 * refunded of it in part refunds, so the progress counts what is left (code review 20/11/2026).
 */
export async function loadReceiptGifts(charityId: string) {
  const [gifts, onIssued] = await Promise.all([
    allCharityDonations<{ id: string; donor_id: string; tax_year: number | null; amount_cents: number; refunded_cents: number; wants_18a: boolean; status: string }>(
      charityId,
      "id, donor_id, tax_year, amount_cents, refunded_cents, wants_18a, status",
      (q) => q.eq("status", "paid").eq("wants_18a", true),
    ),
    loadIssuedGiftIds(charityId),
  ]);
  return { gifts: gifts.map((g) => ({ ...g, amount_cents: n(g.amount_cents), refunded_cents: n(g.refunded_cents) })), onIssued };
}

/** The gifts that are on an issued s18A receipt. */
async function loadIssuedGiftIds(charityId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const issued = await readAllPages<{ donation_id: string }>((from, to, count) =>
    supabase
      .from("charity_receipt_donations")
      .select("donation_id", count ? { count: "exact" } : undefined)
      .eq("charity_id", charityId)
      .eq("status", "issued")
      .order("donation_id")
      .range(from, to),
  );
  return new Set(issued.map((r) => r.donation_id));
}

/** Everything the annual report needs: every paid, refunded or charged-back donation, the campaign names and issued receipts. */
export async function loadReportData(charityId: string) {
  const [gifts, campaignTitles, onIssued] = await Promise.all([
    allCharityDonations<{ id: string; donor_id: string; status: string; amount_cents: number; refunded_cents: number; paid_at: string | null; tax_year: number | null; recurring_id: string | null; campaign_id: string | null; wants_18a: boolean }>(
      charityId,
      "id, donor_id, status, amount_cents, refunded_cents, paid_at, tax_year, recurring_id, campaign_id, wants_18a",
    ),
    loadCampaignTitles(charityId),
    loadIssuedGiftIds(charityId),
  ]);
  return {
    gifts: gifts.map((g) => ({ ...g, amount_cents: n(g.amount_cents), refunded_cents: n(g.refunded_cents) })),
    campaignTitles,
    onIssued,
  };
}

/**
 * One tax year's annual report, for the Report page and its CSV (24/11/2026). The database works the figures out
 * (`charity_report_summary`, which checks the person may see this charity's gifts), so a big charity's 20 000 gifts
 * are no longer read here. Until that function is on the database, the gifts are read and worked out here as before.
 * A refusal or any other error is never taken for "not there yet".
 */
export async function loadAnnualReport(charityId: string, askedYear: number, now: Date): Promise<{ years: number[]; year: number; report: AnnualReport }> {
  const supabase = await createClient();
  const [answer, campaignTitles] = await Promise.all([
    supabase.rpc("charity_report_summary", {
      p_charity_id: charityId,
      // Only a believable year (24/11/2026): ?year=99999999999 overflowed the database's integer (22003) and the page
      // errored. Anything else asks for the latest year, as before.
      p_asked_year: Number.isSafeInteger(askedYear) && askedYear >= 2000 && askedYear <= 2200 ? askedYear : null,
      p_current_year: taxYearFor(now),
      p_start_month: platformConfig.taxYear.startMonth,
      p_time_zone: platformConfig.timeZone,
    }),
    loadCampaignTitles(charityId),
  ]);
  if (!answer.error && answer.data && typeof answer.data === "object") {
    const summary = toReportSummary(answer.data as Record<string, unknown>);
    return { years: summary.years, year: summary.taxYear, report: reportFromSummary(summary, campaignTitles, now) };
  }
  if (answer.error && !isMissingFunctionNamed(answer.error, "charity_report_summary")) throw new Error(answer.error.message);
  if (!answer.error) throw new Error("The annual report came back empty.");

  const data = await loadReportData(charityId);
  const years = reportYears(data.gifts, now);
  const year = pickReportYear(years, askedYear);
  return { years, year, report: annualReport(data.gifts, year, data.campaignTitles, data.onIssued, now) };
}

export const DONATION_FIELDS =
  "id, donor_id, status, amount_cents, refunded_cents, paid_at, created_at, refunded_at, charged_back_at, tax_year, wants_18a, is_anonymous, message, dedication_kind, dedication_name, donor_type, first_name, last_name, organisation_name, registration_number, contact_person, email, phone, address_line1, address_line2, suburb, city, postal_code, recorded_method, external_ref, came_from, campaign_id";

export type DonationRow = {
  id: string;
  donor_id: string;
  status: "pending" | "paid" | "failed" | "refunded" | "charged_back";
  amount_cents: number;
  /** Cents of the gift refunded in part refunds (the gift stays paid). What is left is amount_cents - refunded_cents. */
  refunded_cents: number;
  paid_at: string | null;
  created_at: string;
  refunded_at: string | null;
  charged_back_at: string | null;
  tax_year: number | null;
  wants_18a: boolean;
  is_anonymous: boolean;
  message: string | null;
  /** "honour" or "memory", with the name, if the donor dedicated the donation. */
  dedication_kind: string | null;
  dedication_name: string | null;
  donor_type: string | null;
  first_name: string | null;
  last_name: string | null;
  organisation_name: string | null;
  registration_number: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  suburb: string | null;
  city: string | null;
  postal_code: string | null;
  /** Set when the charity recorded the gift itself (EFT, cash, ...); null for a gift made on Givezy. */
  recorded_method: string | null;
  /** The charity's own reference for a recorded gift (a bank reference). */
  external_ref: string | null;
  /** Where the gift came from: website, app, whatsapp, share_link, qr or recorded (null for older gifts). */
  came_from: string | null;
  /** The campaign the gift was for, if any. */
  campaign_id: string | null;
};

/**
 * One donor's paid gifts to the charity, oldest first, for their largest gift and giving by campaign. Each counts
 * what is left after part refunds; a gift with nothing left is not one (code review 20/11/2026).
 */
export function loadDonorPaidGifts(charityId: string, donorId: string) {
  return allCharityDonations<{ id: string; amount_cents: number; refunded_cents: number; paid_at: string | null; campaign_id: string | null; came_from: string | null }>(
    charityId,
    "id, amount_cents, refunded_cents, paid_at, campaign_id, came_from",
    (q) => q.eq("donor_id", donorId).eq("status", "paid"),
  ).then((rows) => rows.map(({ refunded_cents, ...r }) => ({ ...r, amount_cents: leftCents({ amount_cents: r.amount_cents, refunded_cents }) })).filter((r) => r.amount_cents > 0).sort((a, b) => String(a.paid_at).localeCompare(String(b.paid_at))));
}

/** The latest donations that went through (paid, refunded or charged back), newest first, for the Overview. */
export async function loadRecentDonations(charityId: string, limit = 7): Promise<DonationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("charity_donations")
    .select(DONATION_FIELDS)
    .eq("charity_id", charityId)
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DonationRow[];
}

/**
 * Where the paid gifts of a period came from (website, app, shared link and so on): one row per gift. A gift refunded
 * in full in parts is not one (code review 20/11/2026).
 */
export async function loadGiftSources(charityId: string, period: Period): Promise<{ came_from: string | null }[]> {
  const rows = await allCharityDonations<{ came_from: string | null; amount_cents: number | string; refunded_cents: number | string | null }>(
    charityId,
    "came_from, amount_cents, refunded_cents",
    (q) => q.eq("status", "paid").gte("paid_at", period.from).lt("paid_at", period.to),
  );
  return rows.filter((r) => leftCents(r) > 0).map((r) => ({ came_from: r.came_from }));
}

/** The charity's campaigns by id, for naming them on gifts and in downloads. */
export async function loadCampaignTitles(charityId: string): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("campaigns").select("id, title").eq("charity_id", charityId);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((c) => [c.id as string, c.title as string]));
}

export type Insights = { newDonors: number; returningDonors: number; repeatDonors: number; allDonors: number; monthlyActive: number; monthlyActiveCents: number };

/** New and returning donors in the period, repeat donors and active monthly donors (all time). */
export async function loadInsights(charityId: string, period: Period): Promise<Insights> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("charity_insights", { p_charity_id: charityId, p_from: period.from, p_to: period.to });
  if (error) throw new Error(error.message);
  const r = (Array.isArray(data) ? data[0] : data) ?? {};
  return {
    newDonors: n(r.new_donors),
    returningDonors: n(r.returning_donors),
    repeatDonors: n(r.repeat_donors),
    allDonors: n(r.all_donors),
    monthlyActive: n(r.monthly_active),
    monthlyActiveCents: n(r.monthly_active_cents),
  };
}
