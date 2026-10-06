import { describe, expect, it } from "vitest";
import { calculateFees, FeeError, gatewayChargeOn, type FeeSettings } from "@/lib/fees";
import { percentToPpm } from "@/lib/money";
import { platformConfig } from "@/config/platform";

/**
 * SYNTHETIC TEST RATES. Deliberately odd numbers, NOT Paystack's or anyone's
 * real rates. Real gateway rates live only in config once Yehuda supplies them.
 */
const SYNTHETIC_PERCENT = "4.321";
const SYNTHETIC_FIXED_CENTS = 217;

const base: FeeSettings = {
  platformFeePpm: percentToPpm(platformConfig.fees.platformFeePercent),
  gatewayPercentPpm: percentToPpm(SYNTHETIC_PERCENT),
  gatewayFixedCents: SYNTHETIC_FIXED_CENTS,
  gatewayRatesIncludeVat: true,
  minDonationCents: platformConfig.minDonationCents,
  vatEnabled: false,
  vatRatePpm: percentToPpm(platformConfig.vat.ratePercent),
};

const variants: [string, FeeSettings][] = [
  ["gateway rates include VAT, our VAT off", base],
  ["gateway adds VAT on top, our VAT off", { ...base, gatewayRatesIncludeVat: false }],
  ["gateway rates include VAT, our VAT on", { ...base, vatEnabled: true }],
  ["gateway adds VAT on top, our VAT on", { ...base, gatewayRatesIncludeVat: false, vatEnabled: true }],
];

// R30 minimum, odd cents, round numbers, large gifts.
const gifts = [3_000, 3_001, 3_050, 9_999, 10_000, 18_000, 125_000, 1_800_000, 10_000_000, 100_000_000];

describe.each(variants)("%s", (_label, s) => {
  it.each(gifts)("gift %i cents: parts add up, charity gets the gift, we net our fee", (gift) => {
    const r = calculateFees(gift, s);
    expect(r.amountCents).toBe(gift);
    expect(r.amountCents + r.platformFeeCents + r.feeVatCents + r.processingChargeCents).toBe(r.totalCents);
    expect(r.processingFeeLineCents).toBe(r.totalCents - gift);
    // After the gateway's charge, what's left covers the gift plus our fee (and VAT) in full.
    const left = r.totalCents - gatewayChargeOn(r.totalCents, s);
    expect(left).toBeGreaterThanOrEqual(gift + r.platformFeeCents + r.feeVatCents);
    // And we don't overcharge: one cent less would leave us short.
    const leftIfOneLess = r.totalCents - 1 - gatewayChargeOn(r.totalCents - 1, s);
    expect(leftIfOneLess).toBeLessThan(gift + r.platformFeeCents + r.feeVatCents);
  });

  it("holds for 5 000 gift amounts in a row", () => {
    for (let gift = 3_000; gift < 8_000; gift++) {
      const r = calculateFees(gift, s);
      expect(r.amountCents + r.platformFeeCents + r.feeVatCents + r.processingChargeCents).toBe(r.totalCents);
      expect(r.totalCents - gatewayChargeOn(r.totalCents, s)).toBeGreaterThanOrEqual(
        gift + r.platformFeeCents + r.feeVatCents,
      );
    }
  });
});

describe("our platform fee", () => {
  it("is 3% of the gift, rounded to the nearest cent, halves up", () => {
    expect(calculateFees(3_000, base).platformFeeCents).toBe(90); // R30.00 -> 90c
    expect(calculateFees(3_050, base).platformFeeCents).toBe(92); // 91.5c -> 92c
    expect(calculateFees(3_049, base).platformFeeCents).toBe(91); // 91.47c -> 91c
    expect(calculateFees(125_000, base).platformFeeCents).toBe(3_750); // R1 250 -> R37.50
  });

  it("is never taken out of the gift", () => {
    expect(calculateFees(125_000, base).amountCents).toBe(125_000);
  });
});

describe("VAT on our fee", () => {
  it("is zero while the VAT switch is off", () => {
    expect(calculateFees(125_000, base).feeVatCents).toBe(0);
  });
  it("is 15% of our fee when on, stored separately", () => {
    const r = calculateFees(125_000, { ...base, vatEnabled: true });
    expect(r.platformFeeCents).toBe(3_750);
    expect(r.feeVatCents).toBe(563); // R5.625 -> R5.63
  });
});

describe("refusals", () => {
  it("refuses gifts under the R30 minimum", () => {
    expect(() => calculateFees(2_999, base)).toThrow(FeeError);
  });
  it("refuses while gateway rates are not configured", () => {
    for (const missing of [
      { gatewayPercentPpm: null },
      { gatewayFixedCents: null },
      { gatewayRatesIncludeVat: null },
    ]) {
      expect(() => calculateFees(10_000, { ...base, ...missing })).toThrow(/not been configured/);
    }
  });
  it("refuses nonsense amounts", () => {
    expect(() => calculateFees(0, base)).toThrow(FeeError);
    expect(() => calculateFees(10.5, base)).toThrow(FeeError);
  });
});

describe("config", () => {
  it("ships with gateway rates empty until the rate sheet is supplied", () => {
    expect(platformConfig.fees.gatewayPercent).toBeNull();
    expect(platformConfig.fees.gatewayFixedCents).toBeNull();
  });
});
