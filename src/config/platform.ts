/**
 * Platform configuration. The ONLY place fee, VAT, minimum and tax-year
 * values are defined. Nothing else in the code may hard-code them.
 *
 * Percentages are written as decimal strings ("3" means 3%) and converted to
 * integer parts-per-million by `percentToPpm`, so no floating point is ever
 * involved in money maths.
 */

export const platformConfig = {
  /** Placeholder until the real name is chosen. */
  appName: "Open Hand",
  appTagline: "Give to Johannesburg's Jewish community, simply.",

  locale: "en-ZA",
  timeZone: "Africa/Johannesburg",
  currency: "ZAR",

  fees: {
    /** Our platform fee, as a percentage of the gift. Confirmed: 3%. */
    platformFeePercent: "3",
    /**
     * The gateway's own charge, from its rate sheet. Deliberately empty until
     * Yehuda supplies the real figures. Donations cannot be taken while these
     * are null.
     */
    gatewayPercent: null as string | null,
    gatewayFixedCents: null as number | null,
  },

  /** Minimum gift (not a minimum fee). Confirmed: R30. */
  minDonationCents: 3_000,

  vat: {
    /** Off until the company is VAT-registered. */
    enabled: false,
    ratePercent: "15",
  },

  taxYear: {
    /** SA tax year starts 1 March (month 3) and ends end of February. */
    startMonth: 3,
  },

  donor: {
    minimumAge: 18,
  },
} as const;

export type PlatformConfig = typeof platformConfig;
