/**
 * Donation fee calculation. Pure functions, integer maths only (BigInt).
 *
 * The donor pays: gift + one "Processing fee" line = total.
 * The processing fee is stored in three parts:
 *   platform_fee_cents       our fee, a percentage of the gift
 *   fee_vat_cents            VAT on our fee (only when our VAT switch is on)
 *   processing_charge_cents  the rest: what covers the gateway's own charge
 *
 * The total is grossed up so that after the gateway takes its charge
 * (a percentage of the TOTAL plus a fixed amount) we net exactly our fee
 * (plus VAT on it), and the charity receives exactly the gift:
 *
 *   total = (gift + platform_fee + fee_vat + fixed) / (1 - percentage)
 *
 * If the gateway adds VAT on top of its own rates, its effective percentage
 * and fixed charge are both multiplied by (1 + VAT rate) first.
 *
 * Rounding (agreed with Yehuda, 06/10/2026):
 *   - our platform fee and VAT on it: nearest cent, halves round up
 *   - the total: always UP to the next cent, so we never net less than our fee
 *   - processing charge: whatever is left, so the parts add up exactly
 */

const S = 1_000_000n; // ppm scale

export type FeeSettings = {
  platformFeePpm: number;
  gatewayPercentPpm: number | null;
  gatewayFixedCents: number | null;
  /** Do the gateway's quoted rates already include VAT? null = not yet known. */
  gatewayRatesIncludeVat: boolean | null;
  minDonationCents: number;
  vatEnabled: boolean;
  vatRatePpm: number;
};

export type FeeBreakdown = {
  amountCents: number;
  platformFeeCents: number;
  feeVatCents: number;
  processingChargeCents: number;
  /** What the donor sees as the single "Processing fee" line. */
  processingFeeLineCents: number;
  totalCents: number;
};

export class FeeError extends Error {
  constructor(
    public code: "rates_missing" | "below_minimum" | "invalid_amount",
    message: string,
  ) {
    super(message);
  }
}

/** Gateway rates are configured (they stay empty until the rate sheet arrives). */
export function ratesConfigured(s: FeeSettings): boolean {
  return s.gatewayPercentPpm !== null && s.gatewayFixedCents !== null && s.gatewayRatesIncludeVat !== null;
}

/** a * b / S, rounded to nearest, halves up. Non-negative inputs only. */
function mulPpmRound(a: bigint, ppm: bigint): bigint {
  return (a * ppm * 2n + S) / (2n * S);
}

function ceilDiv(n: bigint, d: bigint): bigint {
  return (n + d - 1n) / d;
}

export function calculateFees(giftCents: number, s: FeeSettings): FeeBreakdown {
  if (!Number.isSafeInteger(giftCents) || giftCents <= 0) {
    throw new FeeError("invalid_amount", "Enter a valid amount.");
  }
  if (giftCents < s.minDonationCents) {
    throw new FeeError("below_minimum", "The donation is below the minimum.");
  }
  if (!ratesConfigured(s)) {
    throw new FeeError("rates_missing", "Gateway rates have not been configured yet.");
  }

  const gift = BigInt(giftCents);
  const platformFee = mulPpmRound(gift, BigInt(s.platformFeePpm));
  const feeVat = s.vatEnabled ? mulPpmRound(platformFee, BigInt(s.vatRatePpm)) : 0n;
  const net = gift + platformFee + feeVat; // what must survive the gateway's charge

  const p = BigInt(s.gatewayPercentPpm!);
  const f = BigInt(s.gatewayFixedCents!);

  let total: bigint;
  if (s.gatewayRatesIncludeVat) {
    // total - (p/S * total + f) >= net
    total = ceilDiv((net + f) * S, S - p);
  } else {
    // Gateway adds VAT on its charge: (p/S * total + f) * (S+V)/S
    const v = BigInt(s.vatRatePpm);
    const denominator = S * S - p * (S + v);
    if (denominator <= 0n) throw new FeeError("rates_missing", "Gateway rates are invalid.");
    total = ceilDiv(net * S * S + f * (S + v) * S, denominator);
  }

  const processingCharge = total - net;
  return {
    amountCents: giftCents,
    platformFeeCents: Number(platformFee),
    feeVatCents: Number(feeVat),
    processingChargeCents: Number(processingCharge),
    processingFeeLineCents: Number(platformFee + feeVat + processingCharge),
    totalCents: Number(total),
  };
}

/**
 * The gateway's charge on a given total, rounded the same way the maths
 * assumes (exact, then up). Used in tests to prove we net our fee.
 */
export function gatewayChargeOn(totalCents: number, s: FeeSettings): number {
  const t = BigInt(totalCents);
  const p = BigInt(s.gatewayPercentPpm!);
  const f = BigInt(s.gatewayFixedCents!);
  if (s.gatewayRatesIncludeVat) return Number(ceilDiv(t * p + f * S, S));
  const v = BigInt(s.vatRatePpm);
  return Number(ceilDiv((t * p + f * S) * (S + v), S * S));
}
