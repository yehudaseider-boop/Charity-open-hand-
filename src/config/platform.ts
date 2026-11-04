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
     * (Yehuda, 14/10/2026). The donor may tick "cover the card charge" so the
     * charity gets the full gift (Yehuda, 25/10/2026); the box only shows once
     * the gateway's rates below are filled in.
     */
    gatewayChargePaidBy: "charity" as "charity" | "givezy" | null,
    /** The gateway's charge, from its rate sheet. Empty until Yehuda supplies it. */
    gatewayPercent: null as string | null,
    gatewayFixedCents: null as number | null,
    /** Do the rates above already include VAT? Also from the rate sheet. */
    gatewayRatesIncludeVat: null as boolean | null,
  },

  /** Minimum donation to a charity. Confirmed: R30. */
  minDonationCents: 3_000,

  /**
   * How quickly we promise to review a charity's application once it is submitted (Yehuda, 30/10/2026:
   * "within 2 working days"). Shown on the apply page, after submitting and in the email; one place to change.
   */
  applicationReviewWorkingDays: 2,

  /** Largest single gift we accept online: R1 000 000. Above that, a typo is far more likely than a gift. */
  maxDonationCents: 100_000_000,

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
    /**
     * "Add my details after paying" (decided 04/11/2026 by Yehuda's CTO): a donor may add missing s18A details to a
     * gift of the tax year just closed only until this day (Johannesburg time) of the year it closed, the date the
     * annual IT3(d) return is due. The date is from accounting-firm and PBO-support sources, not SARS's own page:
     * confirm it with the accountant (go-live list).
     */
    lateDetailsUntil: { month: 5, day: 31 },
  },

  donor: {
    minimumAge: 18,
  },

  checkout: {
    /**
     * One tick on the website's give form instead of two: "I'm 18 or older and I agree to the Terms and Privacy
     * Policy, and that my details are shared with {charity} so they can record my donation." It records the same
     * agreements as the two ticks (decided 04/11/2026).
     * Turn on once Yosef approves the wording (go-live list).
     */
    singleAgreementTick: false as boolean,
  },
} as const;

