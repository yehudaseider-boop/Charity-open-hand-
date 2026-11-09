/**
 * What a donor pays, worked out the same way in the browser (the give form's live total) and on the server
 * (which works it out again at submit and refuses a total the donor did not see). Pure and dependency-free:
 * the config, the fee maths and the card charge rates only.
 */
import { platformConfig } from "@/config/platform";
import { FeeError, priceDonation, type Pricing } from "@/lib/fees";
import { COMMA_THOUSANDS_MESSAGE, formatRand, parseRandToCents, usesCommaThousands } from "@/lib/money";
import { cardChargeRates } from "./card-charge";
import { contributionCents, type ContributionChoice } from "./contribution";

export type Quote = Pricing;

export type QuoteResult =
  /** `cardChargeOffer`: what "cover the card charge" would add to this gift, or null when the box doesn't show (no provider rates yet). */
  | { ok: true; quote: Quote; cardChargeOffer: number | null }
  | { ok: false; message: string; code?: FeeError["code"] };

const minimums = {
  minDonationCents: platformConfig.minDonationCents,
  minContributionCents: platformConfig.minContributionCents,
  maxDonationCents: platformConfig.maxDonationCents,
};

function feeErrorMessage(e: FeeError): string {
  if (e.code === "above_maximum") {
    return `The most you can give online in one go is ${formatRand(platformConfig.maxDonationCents)}. Check the amount, or for a bigger gift please contact the charity directly.`;
  }
  if (e.code === "below_minimum") return `The minimum donation is ${formatRand(platformConfig.minDonationCents)}.`;
  if (e.code === "contribution_below_minimum") {
    return `The minimum contribution to ${platformConfig.appName} is ${formatRand(platformConfig.minContributionCents)}.`;
  }
  return e.message;
}

/**
 * Work out what the donor will pay: the donation plus any contribution, plus the card charge when the donor ticked
 * "cover the card charge" and the provider's rates are known. No fees.
 */
export function quoteDonation(giftCents: number, contributionCents: number, coverCardCharge = false): QuoteResult {
  try {
    const rates = cardChargeRates();
    const quote = priceDonation(giftCents, contributionCents, minimums, coverCardCharge ? rates : null);
    const cardChargeOffer = rates ? (quote.cardChargeCents || priceDonation(giftCents, contributionCents, minimums, rates).cardChargeCents) : null;
    return { ok: true, quote, cardChargeOffer };
  } catch (e) {
    if (e instanceof FeeError) return { ok: false, message: feeErrorMessage(e), code: e.code };
    throw e;
  }
}

/**
 * The give form's live total, from what is chosen: the amount typed, and the contribution to Givezy (a preset
 * button, an amount typed under "Other", or "No thanks"). The same `quoteDonation` the server runs again at Give,
 * so the total on the button is the total charged. A problem names the box it belongs to.
 */
export function quoteFromTyped(
  amountText: string,
  contribution: ContributionChoice,
  otherText: string,
  cover: boolean,
): { ok: true; quote: Quote } | { ok: false; message: string; field: "amount" | "contribution" } {
  const gift = parseRandToCents(amountText);
  if (gift === null) {
    if (!amountText.trim()) return { ok: false, field: "amount", message: "Enter an amount in Rand, for example 180." };
    if (usesCommaThousands(amountText)) return { ok: false, field: "amount", message: `${COMMA_THOUSANDS_MESSAGE}.` };
    return { ok: false, field: "amount", message: "Enter an amount in Rand, for example 180 or 180.50." };
  }
  if (gift === 0) return { ok: false, field: "amount", message: `The minimum donation is ${formatRand(platformConfig.minDonationCents)}.` };
  const chosen = contributionCents(contribution, otherText, platformConfig.minContributionCents);
  if (!chosen.ok) return { ok: false, field: "contribution", message: chosen.message };
  const result = quoteDonation(gift, chosen.cents, cover);
  if (result.ok) return { ok: true, quote: result.quote };
  // priceDonation checks each line against the maximum on its own, so an above-maximum result is the
  // contribution's only when the gift itself fits.
  const contributionProblem = result.code === "contribution_below_minimum" || (result.code === "above_maximum" && gift <= platformConfig.maxDonationCents);
  return { ok: false, field: contributionProblem ? "contribution" : "amount", message: result.message };
}

/**
 * The server's check at Give: work the total out again from the amounts sent, and refuse one the donor did not see
 * (never charge a total that was not on screen). The refusal carries the new figures for the form to show.
 */
export function checkShownTotal(
  giftCents: number,
  contributionCents: number,
  coverCardCharge: boolean,
  shownTotalCents: number,
): { ok: true; quote: Quote } | { ok: false; message: string; quote?: Quote } {
  const quoted = quoteDonation(giftCents, contributionCents, coverCardCharge);
  if (!quoted.ok) return { ok: false, message: quoted.message };
  if (quoted.quote.totalCents !== shownTotalCents) {
    return {
      ok: false,
      message: `The total is now ${formatRand(quoted.quote.totalCents)}, not the ${formatRand(shownTotalCents)} you saw, so nothing was charged. Check the new total above, then press Give again.`,
      quote: quoted.quote,
    };
  }
  return { ok: true, quote: quoted.quote };
}
