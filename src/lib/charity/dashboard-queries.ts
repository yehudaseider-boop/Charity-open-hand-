import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MonthlyRow, Period } from "./dashboard";

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
  email: string;
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
  // The database answers at most 1 000 rows at a time, so a long list is read page by page.
  const rows: DonorRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.rpc("charity_donor_list", { p_charity_id: charityId }).range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as DonorRow[]));
    if (!data || data.length < 1000) break;
  }
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
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await narrow(supabase.from("charity_donations").select(fields).eq("charity_id", charityId)).order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

/** Each donor's monthly payments, to mark who gives monthly on the donor list. */
export function loadMonthlyGifts(charityId: string) {
  return allCharityDonations<{ donor_id: string; recurring_id: string | null }>(charityId, "donor_id, recurring_id", (q) => q.not("recurring_id", "is", null));
}

/** Paid gifts that asked for an s18A receipt, and which of them are on an issued receipt. */
export async function loadReceiptGifts(charityId: string) {
  const gifts = await allCharityDonations<{ id: string; donor_id: string; tax_year: number | null; amount_cents: number; wants_18a: boolean; status: string }>(
    charityId,
    "id, donor_id, tax_year, amount_cents, wants_18a, status",
    (q) => q.eq("status", "paid").eq("wants_18a", true),
  );
  const supabase = await createClient();
  const onIssued = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("charity_receipt_donations").select("donation_id").eq("charity_id", charityId).eq("status", "issued").order("donation_id").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) onIssued.add(r.donation_id as string);
    if (!data || data.length < 1000) break;
  }
  return { gifts: gifts.map((g) => ({ ...g, amount_cents: n(g.amount_cents) })), onIssued };
}

export const DONATION_FIELDS =
  "id, donor_id, status, amount_cents, paid_at, created_at, refunded_at, charged_back_at, tax_year, wants_18a, is_anonymous, message, dedication_kind, dedication_name, donor_type, first_name, last_name, organisation_name, registration_number, contact_person, email, phone, address_line1, address_line2, suburb, city, postal_code";

export type DonationRow = {
  id: string;
  donor_id: string;
  status: "pending" | "paid" | "failed" | "refunded" | "charged_back";
  amount_cents: number;
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
};

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
