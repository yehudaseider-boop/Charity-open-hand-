/**
 * What a donor pays. Pure functions, integer cents only. Dependency-free:
 * the phone app imports this file too.
 *
 * There is no platform fee and no processing fee (Yehuda, 08/10/2026).
 * The donor pays two separate line items:
 *   the donation to the charity        (at least the minimum donation)
 *   an optional contribution to NEDIV lev (0, or at least its minimum)
 *
 *   total = donation + contribution
 *
 * The two are always recorded separately, whether or not the gateway can
 * split one payment between two accounts.
 */

export type Minimums = {
  minDonationCents: number;
  minContributionCents: number;
};

export type Pricing = {
  /** To the charity. */
  amountCents: number;
  /** To NEDIV lev, 0 if the box was not ticked. */
  contributionCents: number;
  totalCents: number;
};

export class FeeError extends Error {
  constructor(
    public code: "invalid_amount" | "below_minimum" | "contribution_below_minimum",
    message: string,
  ) {
    super(message);
  }
}

export function priceDonation(amountCents: number, contributionCents: number, m: Minimums): Pricing {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new FeeError("invalid_amount", "Enter a valid amount.");
  }
  if (!Number.isSafeInteger(contributionCents) || contributionCents < 0) {
    throw new FeeError("invalid_amount", "Enter a valid contribution.");
  }
  if (amountCents < m.minDonationCents) {
    throw new FeeError("below_minimum", "The donation is below the minimum.");
  }
  if (contributionCents > 0 && contributionCents < m.minContributionCents) {
    throw new FeeError("contribution_below_minimum", "The contribution is below the minimum.");
  }
  const total = amountCents + contributionCents;
  if (!Number.isSafeInteger(total)) throw new FeeError("invalid_amount", "Enter a valid amount.");
  return { amountCents, contributionCents, totalCents: total };
}
