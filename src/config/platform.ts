/**
 * Platform configuration. The ONLY place fee, VAT, minimum and tax-year
 * values are defined. Nothing else in the code may hard-code them.
 *
 * Percentages are written as decimal strings ("3" means 3%) and converted to
 * integer parts-per-million by `percentToPpm`, so no floating point is ever
 * involved in money maths.
 */

export const platformConfig = {
  appName: "Givezy",
  appTagline: "Give to the causes you care about, simply.",

  locale: "en-ZA",
  timeZone: "Africa/Johannesburg",
  currency: "ZAR",

  fees: {
    /**
     * No platform fee and no processing fee on donations (Yehuda, 08/10/2026).
     * The donor may tick a box to give Givezy a separate contribution.
     *
     * The gateway's own charge is paid by the charity, out of its donation
     * (Yehuda, 14/10/2026). Offering the donor to cover it is not built yet: it
     * needs the gateway's rates below.
     */
    gatewayChargePaidBy: "charity" as "charity" | "nediv_lev" | null,
    /** The gateway's charge, from its rate sheet. Empty until Yehuda supplies it. */
    gatewayPercent: null as string | null,
    gatewayFixedCents: null as number | null,
    /** Do the rates above already include VAT? Also from the rate sheet. */
    gatewayRatesIncludeVat: null as boolean | null,
  },

  /** Minimum donation to a charity. Confirmed: R30. */
  minDonationCents: 3_000,

  /** Minimum optional contribution to Givezy, when the box is ticked. Confirmed: R10. */
  minContributionCents: 1_000,

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
