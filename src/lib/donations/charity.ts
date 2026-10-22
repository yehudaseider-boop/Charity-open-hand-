import "server-only";
import { canIssue18a } from "@/lib/charities";
import { platformConfig } from "@/config/platform";
import { getGateway, type PaymentGateway } from "@/lib/gateway";
import { createAdminClient } from "@/lib/supabase/admin";
import { impactUnitFrom } from "@/lib/charity/impact";

/** A charity as checkout needs it, or null if it isn't public. */
export async function loadDonatableCharity(slug: string) {
  const { data } = await createAdminClient()
    .from("charities")
    .select("id, slug, name_en, name_he, status, is_verified, is_s18a, mandate_signed_at, gateway, gateway_subaccount_ref, suggested_amounts_cents, impact_unit_cents, impact_unit_one, impact_unit_many")
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
  const connected = gateway !== null && data.gateway === gateway.name && Boolean(data.gateway_subaccount_ref);
  return {
    ...data,
    receiptsAvailable: canIssue18a(data),
    /** What one gift pays for, in the charity's own figure (null when it set none). */
    impactUnit: impactUnitFrom(data),
    /** The charity's own suggested amounts (cents, smallest first); empty when it chose none. */
    suggestedCents: ((data.suggested_amounts_cents ?? []) as (number | string)[]).map(Number).filter((c) => Number.isSafeInteger(c) && c > 0),
    /**
     * Can take payments now. The test gateway always can (and, if it is set to split, needs the
     * charity's test account). A real gateway is closed until it is decided who pays the gateway's
     * charge, and then only takes a donation as a split payment straight to a charity that has been
     * connected: otherwise the money would land with Givezy instead of the charity.
     */
    acceptingPayments:
      gateway !== null &&
      (gateway.name === "test"
        ? !gateway.splitsPayments || connected
        : platformConfig.fees.gatewayChargePaidBy !== null && gateway.splitsPayments && connected),
    splitAccountRef: gateway?.splitsPayments && data.gateway === gateway.name ? data.gateway_subaccount_ref : null,
  };
}
