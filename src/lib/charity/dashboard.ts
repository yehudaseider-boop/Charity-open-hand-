import "server-only";
import { notFound, redirect } from "next/navigation";
import { platformConfig } from "@/config/platform";
import { hasSecondFactor, requireViewer, twoStepPath, type Viewer } from "@/lib/auth";
import { monthStart, taxYearFor } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type { DonationFilters } from "./donation-filters";

export type DashboardCharity = { id: string; name_en: string; name_he: string | null; status: string };

/**
 * The signed-in person may see this charity's dashboard: they administer it
 * (or are a platform admin) and have completed the authenticator-app step.
 * A stranger gets "not found". The database checks the same thing again on
 * every query.
 */
export async function requireCharityDashboard(id: string, path: string): Promise<{ viewer: Viewer; charity: DashboardCharity }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const viewer = await requireViewer(path);
  const charity = viewer.charities.find((c) => c.id === id);
  if (!charity && !viewer.isPlatformAdmin) notFound();

  if (!(await hasSecondFactor())) redirect(twoStepPath(path));

  if (charity) return { viewer, charity };
  const supabase = await createClient();
  const { data } = await supabase.from("charities").select("id, name_en, name_he, status").eq("id", id).maybeSingle();
  if (!data) notFound();
  return { viewer, charity: data };
}

const num = (v: unknown) => Number(v ?? 0);

export async function loadOverview(charityId: string, now = new Date()) {
  const supabase = await createClient();
  const taxYear = taxYearFor(now);
  const thisMonth = monthStart(now);
  const chartFrom = monthStart(now, 11);

  const [summary, months, monthly] = await Promise.all([
    supabase.rpc("charity_giving_summary", { p_charity_id: charityId, p_tax_year: taxYear, p_month_start: thisMonth }).single(),
    supabase.rpc("charity_giving_by_month", { p_charity_id: charityId, p_since: chartFrom, p_time_zone: platformConfig.timeZone }),
    supabase.rpc("charity_monthly_donations_summary", { p_charity_id: charityId }),
  ]);
  if (summary.error) throw summary.error;
  if (months.error) throw months.error;
  if (monthly.error) throw monthly.error;

  const s = summary.data as Record<string, unknown>;
  const byMonth = new Map(
    (months.data as { month: string; paid_cents: unknown; paid_count: unknown }[]).map((m) => [m.month, m]),
  );
  // Every month of the last 12, including empty ones, oldest first.
  const chart = Array.from({ length: 12 }, (_, i) => {
    const key = monthStart(now, 11 - i).slice(0, 10);
    const m = byMonth.get(key);
    return { month: key, paidCents: num(m?.paid_cents), paidCount: num(m?.paid_count) };
  });
  const recurring = Object.fromEntries(
    (monthly.data as { status: string; donations: unknown; amount_cents: unknown }[]).map((r) => [
      r.status,
      { count: num(r.donations), cents: num(r.amount_cents) },
    ]),
  ) as Partial<Record<"active" | "paused" | "cancelled" | "failed", { count: number; cents: number }>>;

  return {
    taxYear,
    month: { paidCount: num(s.month_paid_count), paidCents: num(s.month_paid_cents) },
    year: {
      paidCount: num(s.tax_year_paid_count),
      paidCents: num(s.tax_year_paid_cents),
      donors: num(s.tax_year_donors),
      wants18aCount: num(s.tax_year_18a_count),
      reversedCount: num(s.tax_year_reversed_count),
      reversedCents: num(s.tax_year_reversed_cents),
    },
    pendingCount: num(s.pending_count),
    failedThisMonthCount: num(s.failed_this_month_count),
    recurring,
    chart,
  };
}

const LIST_FIELDS =
  "id, donation_date, paid_at, amount_cents, status, wants_18a, is_anonymous, donor_type, first_name, last_name, organisation_name, email, campaign_title, recurring_id";

export type DonationRow = {
  id: string;
  donation_date: string;
  paid_at: string | null;
  amount_cents: number;
  status: "pending" | "paid" | "failed" | "refunded" | "charged_back";
  wants_18a: boolean;
  is_anonymous: boolean;
  donor_type: "individual" | "company" | "trust" | null;
  first_name: string | null;
  last_name: string | null;
  organisation_name: string | null;
  email: string | null;
  campaign_title: string | null;
  recurring_id: string | null;
};

export const PAGE_SIZE = 50;

export async function loadDonations(charityId: string, f: DonationFilters, search: string) {
  const supabase = await createClient();
  let q = supabase
    .from("charity_donations")
    .select(LIST_FIELDS, { count: "exact" })
    .eq("charity_id", charityId);
  if (f.status === "reversed") q = q.in("status", ["refunded", "charged_back"]);
  else if (f.status) q = q.eq("status", f.status);
  if (f.wants18a !== undefined) q = q.eq("wants_18a", f.wants18a);
  if (f.campaign === "none") q = q.is("campaign_id", null);
  else if (f.campaign) q = q.eq("campaign_id", f.campaign);
  if (f.from) q = q.gte("donation_date", f.from);
  if (f.toExclusive) q = q.lt("donation_date", f.toExclusive);
  if (search) {
    const like = `*${search}*`;
    q = q.or(
      ["first_name", "last_name", "organisation_name", "email", "contact_person"].map((c) => `${c}.ilike.${like}`).join(","),
    );
  }
  const from = (f.page - 1) * PAGE_SIZE;
  const { data, count, error } = await q
    .order("donation_date", { ascending: false })
    .order("id")
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: (data ?? []) as DonationRow[], total: count ?? 0 };
}

export async function loadCampaignOptions(charityId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("campaigns").select("id, title").eq("charity_id", charityId).order("title");
  if (error) throw error;
  return data;
}

export async function loadDonation(charityId: string, donationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(donationId)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("charity_donations")
    .select("*")
    .eq("charity_id", charityId)
    .eq("id", donationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  return data as DonationRow & Record<string, string | number | boolean | null>;
}

/** "Dina Donor", "Test Trading (Pty) Ltd", or the email if no name was given. */
export function donorName(d: Pick<DonationRow, "donor_type" | "first_name" | "last_name" | "organisation_name" | "email">) {
  if (d.donor_type && d.donor_type !== "individual" && d.organisation_name) return d.organisation_name;
  const name = [d.first_name, d.last_name].filter(Boolean).join(" ");
  return name || d.email || "Unknown donor";
}
