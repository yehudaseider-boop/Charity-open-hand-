import "server-only";
import type { FeeSettings } from "@/lib/fees";
import { createAdminClient } from "@/lib/supabase/admin";

/** The fee settings in force now: a charity's override if any, else the global row. */
export async function loadFeeSettings(charityId: string): Promise<{ id: string; settings: FeeSettings }> {
  const { data, error } = await createAdminClient()
    .from("fee_settings")
    .select("*")
    .or(`charity_id.is.null,charity_id.eq.${charityId}`)
    .lte("effective_from", new Date().toISOString())
    .order("effective_from", { ascending: false });
  if (error) throw error;
  const row = data.find((r) => r.charity_id === charityId) ?? data.find((r) => r.charity_id === null);
  if (!row) throw new Error("No fee settings in force.");
  return {
    id: row.id,
    settings: {
      platformFeePpm: row.platform_fee_ppm,
      gatewayPercentPpm: row.gateway_percent_ppm,
      gatewayFixedCents: row.gateway_fixed_cents,
      gatewayRatesIncludeVat: row.gateway_rates_include_vat,
      minDonationCents: Number(row.min_donation_cents),
      vatEnabled: row.vat_enabled,
      vatRatePpm: row.vat_rate_ppm,
    },
  };
}
