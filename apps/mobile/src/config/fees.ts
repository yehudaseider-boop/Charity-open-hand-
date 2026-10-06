/**
 * The single fee constant the app reads.
 *
 * SAMPLE RATE, NOT FINAL. The gateway (Paystack or Payfast) and its rates are
 * not confirmed. These gateway figures are made up for mock screens only and
 * every screen that shows a fee says so. Replace with the real rate sheet,
 * or better, fetch the live fee settings from the server, before launch.
 *
 * The 3% platform fee, the R30 minimum and 15% VAT are confirmed.
 */
import type { FeeSettings } from "@shared/fees";
import { percentToPpm } from "@shared/money";

export const FEE_SETTINGS_ARE_SAMPLE = true;

export const feeSettings: FeeSettings = {
  platformFeePpm: percentToPpm("3"),
  gatewayPercentPpm: percentToPpm("4.321"), // SAMPLE ONLY
  gatewayFixedCents: 217, // SAMPLE ONLY
  gatewayRatesIncludeVat: true, // SAMPLE ONLY
  minDonationCents: 3_000,
  vatEnabled: false,
  vatRatePpm: percentToPpm("15"),
};
