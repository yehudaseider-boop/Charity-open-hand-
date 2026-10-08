import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Period } from "./dashboard";

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
  return ((data ?? []) as { month: string; donation_count: number; amount_cents: number }[]).map((r) => ({
    month: r.month,
    donationCount: n(r.donation_count),
    amountCents: n(r.amount_cents),
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
  const { data, error } = await supabase.rpc("charity_donor_list", { p_charity_id: charityId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as DonorRow[]).map((d) => ({ ...d, donation_count: n(d.donation_count), total_cents: n(d.total_cents) }));
}

export const DONATION_FIELDS =
  "id, donor_id, status, amount_cents, paid_at, created_at, refunded_at, charged_back_at, tax_year, wants_18a, is_anonymous, message, donor_type, first_name, last_name, organisation_name, registration_number, contact_person, email, phone, address_line1, address_line2, suburb, city, postal_code, id_number_last4, tax_reference_last4";

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
  id_number_last4: string | null;
  tax_reference_last4: string | null;
};
