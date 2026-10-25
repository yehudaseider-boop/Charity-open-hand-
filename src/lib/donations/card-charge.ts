import { platformConfig } from "@/config/platform";
import { cardChargeToCover, type CardChargeRates } from "@/lib/fees";
import { percentToPpm } from "@/lib/money";

type FeeSettings = {
  gatewayChargePaidBy: "charity" | "givezy" | null;
  gatewayPercent: string | null;
  gatewayFixedCents: number | null;
  gatewayRatesIncludeVat: boolean | null;
};

/**
 * The payment provider's rates, for the "cover the card charge" box, or null when the box must not show: the rates
 * aren't filled in yet (we never guess a rate), or Givezy pays the charge itself (the charity loses nothing).
 */
export function cardChargeRates(
  fees: FeeSettings = platformConfig.fees,
  vatPercent: string = platformConfig.vat.ratePercent,
): CardChargeRates | null {
  if (fees.gatewayChargePaidBy !== "charity") return null;
  if (fees.gatewayPercent === null || fees.gatewayFixedCents === null || fees.gatewayRatesIncludeVat === null) return null;
  return {
    percentPpm: percentToPpm(fees.gatewayPercent),
    fixedCents: fees.gatewayFixedCents,
    vatOnTopPpm: fees.gatewayRatesIncludeVat ? 0 : percentToPpm(vatPercent),
  };
}

/**
 * A monthly donation whose donor chose to cover the card charge: worked out again each month from the current rates,
 * so a change in the provider's rates is followed. Nothing when the rates are not known.
 */
export function monthlyCardCharge(amountCents: number, contributionCents: number, covers: boolean, rates: CardChargeRates | null = cardChargeRates()): number {
  return covers && rates ? cardChargeToCover(amountCents + contributionCents, rates) : 0;
}
