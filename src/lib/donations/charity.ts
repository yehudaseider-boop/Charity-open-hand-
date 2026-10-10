import "server-only";
import { canIssue18a } from "@/lib/charities";
import { platformConfig } from "@/config/platform";
import { getGateway, type PaymentGateway } from "@/lib/gateway";
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
  let gateway: PaymentGateway | null = null;
  try {
    gateway = getGateway();
  } catch (e) {
    // A misconfigured gateway must not take public pages down: show "not accepting" instead.
    console.error(e);
  }
  return {
    ...data,
    receiptsAvailable: canIssue18a(data),
    /**
     * Can take payments now. Real gateways stay closed until it is decided who
     * pays the gateway's charge; a splitting gateway also needs the charity's account.
     */
    acceptingPayments:
      gateway !== null &&
      (gateway.name === "test" || platformConfig.fees.gatewayChargePaidBy !== null) &&
      (!gateway.splitsPayments || (data.gateway === gateway.name && Boolean(data.gateway_subaccount_ref))),
    /** The charity's account at the gateway, used only when the gateway splits payments. */
    splitAccountRef: gateway?.splitsPayments && data.gateway === gateway.name ? data.gateway_subaccount_ref : null,
  };
}
