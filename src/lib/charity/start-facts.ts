import "server-only";
import { canIssue18a } from "@/lib/charities";
import { createAdminClient } from "@/lib/supabase/admin";
import { listJourneys } from "./journey-store";
import type { StartFacts } from "./checklist";

type CharityFacts = StartFacts["charity"] & Parameters<typeof canIssue18a>[0];

/**
 * What "Getting started" needs to know, read by the server after loadCharityForManager. Only yes or no answers:
 * never the bank account or the tax number themselves. A part that can't be read (a newer table not set up yet)
 * leaves its step out rather than showing it wrong.
 */
export async function loadStartFacts(charityId: string, charity: CharityFacts, updates: number): Promise<StartFacts> {
  const db = createAdminClient();
  const issues = canIssue18a(charity);
  const [priv, journeyOn, teamSize] = await Promise.all([
    db.from("charity_private").select("bank_account_last4, bank_branch_code, bank_verified_at, tax_reference_number").eq("charity_id", charityId).maybeSingle().then(
      (r) => r,
      (e: unknown) => ({ data: null, error: { message: e instanceof Error ? e.message : String(e) } }),
    ),
    listJourneys(charityId).then(
      (js) => js.some((j) => j.enabled),
      () => null,
    ),
    db.from("charity_admins").select("user_id", { count: "exact", head: true }).eq("charity_id", charityId).then(
      ({ count, error }) => (error ? null : (count ?? 0)),
      () => null,
    ),
  ]);
  // If the private row can't be read, the bank and SARS steps are left out rather than the overview failing.
  const p = priv.error ? undefined : priv.data;
  if (priv.error) console.error("[getting started] private details couldn't load", priv.error.message);
  return {
    charity: {
      logo_path: charity.logo_path,
      cover_path: charity.cover_path,
      description_en: charity.description_en,
      funds_use_en: charity.funds_use_en,
      thank_you_en: charity.thank_you_en,
      gateway_subaccount_ref: charity.gateway_subaccount_ref,
    },
    bank: p === undefined ? null : { saved: Boolean(p?.bank_account_last4 && p?.bank_branch_code), checked: Boolean(p?.bank_verified_at) },
    s18a: { issues, sarsDetails: p === undefined ? null : Boolean((p?.tax_reference_number as string | null)?.trim()) },
    journeyOn,
    updates,
    teamSize,
  };
}
