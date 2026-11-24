import "server-only";
import { canIssue18a } from "@/lib/charities";
import { platformConfig } from "@/config/platform";
import { getGateway, type PaymentGateway } from "@/lib/gateway";
import { createAdminClient } from "@/lib/supabase/admin";
import { impactUnitFrom } from "@/lib/charity/impact";
import { givingPaused } from "@/lib/giving-pause";

/** The columns checkout and the give page need. */
export const DONATABLE_COLUMNS = "id, slug, name_en, status, is_verified, is_s18a, mandate_signed_at, gateway, gateway_subaccount_ref, suggested_amounts_cents, impact_unit_cents, impact_unit_one, impact_unit_many";

/** A charity as checkout needs it, or null if it isn't public. Always read live: money paths never use the cache. */
export async function loadDonatableCharity(slug: string) {
  const { data } = await createAdminClient().from("charities").select(DONATABLE_COLUMNS).eq("slug", slug).eq("status", "approved").maybeSingle();
  return data ? donatableFrom(data) : null;
}

type DonatableRow = {
  id: string; slug: string; name_en: string; status: string; is_verified: boolean; is_s18a: boolean; mandate_signed_at: string | null;
  gateway: string | null; gateway_subaccount_ref: string | null; suggested_amounts_cents: unknown;
  impact_unit_cents: number | string | null; impact_unit_one: string | null; impact_unit_many: string | null;
};

/**
 * What the pages and checkout work out from a charity's row. Done on every request, never inside the page cache
 * (24/11/2026): the pause switch, the gateway settings and the day's rules always act at once; only the database
 * row can be a little old, for the pages (src/lib/charity/public-cache.ts).
 */
export function donatableFrom<R extends DonatableRow>(data: R) {
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
      !givingPaused() &&
      gateway !== null &&
      (gateway.name === "test"
        ? !gateway.splitsPayments || connected
        : platformConfig.fees.gatewayChargePaidBy !== null && gateway.splitsPayments && connected),
    /** The pause switch is on (GIVING_PAUSED=yes): not accepting for that reason, so pages can say so. */
    givingPaused: givingPaused(),
    splitAccountRef: gateway?.splitsPayments && data.gateway === gateway.name ? data.gateway_subaccount_ref : null,
  };
}
