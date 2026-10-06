import "server-only";
import { canIssue18a } from "@/lib/charities";
import { getGateway } from "@/lib/gateway";
import { createAdminClient } from "@/lib/supabase/admin";

/** A charity as checkout needs it, or null if it isn't public. */
export async function loadDonatableCharity(slug: string) {
  const { data } = await createAdminClient()
    .from("charities")
    .select("id, slug, name_en, name_he, status, is_verified, is_s18a, mandate_signed_at, gateway, gateway_subaccount_ref")
    .eq("slug", slug)
    .eq("status", "approved")
    .maybeSingle();
  if (!data) return null;
  let gatewayName: string | null = null;
  try {
    gatewayName = getGateway().name;
  } catch (e) {
    // A misconfigured gateway must not take public pages down: show "not accepting" instead.
    console.error(e);
  }
  return {
    ...data,
    receiptsAvailable: canIssue18a(data),
    /** Connected to the active gateway, so it can take payments. */
    acceptingPayments: gatewayName !== null && data.gateway === gatewayName && Boolean(data.gateway_subaccount_ref),
  };
}
