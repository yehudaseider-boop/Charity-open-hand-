/**
 * What a donor pays. Pure functions, integer cents only. Dependency-free:
 * the phone app imports this file too.
 *
 * There is no platform fee and no processing fee (Yehuda, 08/10/2026).
 * The donor pays up to three separate line items:
 *   the donation to the charity        (at least the minimum donation)
 *   an optional contribution to Givezy (0, or at least its minimum)
 *   an optional card charge cover      (0, or what the payment provider takes, so the charity gets the full gift)
 *
 *   total = donation + contribution + card charge cover
 *
 * The two are always recorded separately, whether or not the gateway can
 * split one payment between two accounts.
 */

export type Minimums = {
  minDonationCents: number;
  minContributionCents: number;
  /** Optional: the largest gift accepted. */
  maxDonationCents?: number;
};

export type Pricing = {
  /** To the charity. */
  amountCents: number;
  /** To Givezy, 0 if the box was not ticked. */
  contributionCents: number;
  /** Paid by the donor so the charity gets the full gift, 0 if the box was not ticked. Goes to the charity's line. */
  cardChargeCents: number;
  totalCents: number;
};

/** The payment provider's charge on one payment, as integers. */
export type CardChargeRates = {
  percentPpm: number;
  fixedCents: number;
  /** The provider adds VAT on top of the rates above: the VAT rate in ppm. 0 when the rates already include it. */
  vatOnTopPpm: number;
};

const PPM = BigInt(1_000_000);

/** What the provider takes on a payment of `totalCents`, rounded up to the cent. */
export function providerCharge(totalCents: number, r: CardChargeRates): number {
  const t = BigInt(totalCents);
  // (percent * total + fixed) * (1 + VAT), all in millionths, rounded up.
  const before = BigInt(r.percentPpm) * t + BigInt(r.fixedCents) * PPM;
  const withVat = before * (PPM + BigInt(r.vatOnTopPpm));
  const denom = PPM * PPM;
  return Number((withVat + denom - BigInt(1)) / denom);
}

/**
 * How much to add so that, after the provider takes its charge on the whole payment (which now includes this
 * amount), the charity still receives the full gift: the smallest cover with cover >= charge(base + cover).
 * Rounded up, so a charity is never short by a cent.
 */
export function cardChargeToCover(baseCents: number, r: CardChargeRates): number {
  if (!Number.isSafeInteger(baseCents) || baseCents <= 0) throw new FeeError("invalid_amount", "Enter a valid amount.");
  if (r.percentPpm < 0 || r.percentPpm >= 500_000 || r.fixedCents < 0 || r.vatOnTopPpm < 0) throw new Error("Card charge rates are not usable.");
  let cover = providerCharge(baseCents, r);
  for (let i = 0; i < 50; i++) {
    const needed = providerCharge(baseCents + cover, r);
    if (needed <= cover) return cover;
    cover = needed;
  }
  throw new Error("Card charge cover did not settle.");
}

export class FeeError extends Error {
  constructor(
    public code: "invalid_amount" | "below_minimum" | "above_maximum" | "contribution_below_minimum",
    message: string,
  ) {
    super(message);
  }
}

/**
 * `coverRates`: the donor ticked "cover the card charge" and the provider's rates are known. The charge is worked out
 * on the whole payment (gift and contribution), because the provider charges the whole payment and the charity bears it.
 */
export function priceDonation(amountCents: number, contributionCents: number, m: Minimums, coverRates?: CardChargeRates | null): Pricing {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new FeeError("invalid_amount", "Enter a valid amount.");
  }
  if (!Number.isSafeInteger(contributionCents) || contributionCents < 0) {
    throw new FeeError("invalid_amount", "Enter a valid contribution.");
  }
  if (amountCents < m.minDonationCents) {
    throw new FeeError("below_minimum", "The donation is below the minimum.");
  }
  if (m.maxDonationCents !== undefined && amountCents > m.maxDonationCents) {
    throw new FeeError("above_maximum", "That amount is above the most we can take online. Please give a smaller amount or contact us.");
  }
  if (m.maxDonationCents !== undefined && contributionCents > m.maxDonationCents) {
    throw new FeeError("above_maximum", "That contribution is above the most we can take online. Please check the amount.");
  }
  if (contributionCents > 0 && contributionCents < m.minContributionCents) {
    throw new FeeError("contribution_below_minimum", "The contribution is below the minimum.");
  }
  const base = amountCents + contributionCents;
  if (!Number.isSafeInteger(base)) throw new FeeError("invalid_amount", "Enter a valid amount.");
  const cardChargeCents = coverRates ? cardChargeToCover(base, coverRates) : 0;
  return { amountCents, contributionCents, cardChargeCents, totalCents: base + cardChargeCents };
}
