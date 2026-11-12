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
     * The donor may give Givezy a separate contribution (the buttons below, or "No thanks").
     *
     * The gateway's own charge: each side pays it on its own share, in proportion
     * (Yehuda, 09/11/2026: "Givezy should cover ... its charge"). The charity pays the
     * charge on its gift, Givezy on the contribution. Was the charity on the whole
     * payment (14/10/2026). The donor may tick "cover the card charge" so the
     * charity gets the full gift (Yehuda, 25/10/2026); the box only shows once
     * the gateway's rates below are filled in.
     */
    gatewayChargePaidBy: "each" as "charity" | "givezy" | "each" | null,
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

  /** Minimum optional contribution to Givezy, for an amount the donor types under "Other". Confirmed: R10. */
  minContributionCents: 1_000,

  /**
   * The contribution to Givezy on the give form (Yehuda, 09/11/2026): these amount buttons, then "Other" and
   * "No thanks" (R0). Rand amounts, not a percentage. The default is preselected and must be one of the presets
   * (anything else starts on "No thanks"). With a monthly gift the contribution repeats each month.
   */
  contributionPresetsCents: [1_000, 1_500, 2_000],
  contributionDefaultCents: 1_000,

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

  /**
   * Card-testing protection on every way a gift starts: the website's give form, monthly sign-up and the phone app
   * (built 11/11/2026). STARTING VALUES, for Yehuda to confirm before launch (go-live list). "tries" is how many are
   * allowed in "minutes"; the next one is refused with a plain "too many tries" message (nothing is charged).
   * An address is shared by many donors (an office, a school hall, a mobile network), so it gets more than an email.
   */
  givingGuard: {
    /** Gift starts per email address. */
    perEmail: { tries: 5, minutes: 10 },
    perEmailDay: { tries: 20, minutes: 1_440 },
    /**
     * Gift starts per internet address. Raised on 12/11/2026 (from 30 and 150): South African mobile networks put
     * very many phones behind one shared address, so a busy campaign evening must not stop real donors. Starting
     * values for Yehuda to confirm (go-live list); the per-email limits above stay as they were.
     */
    perAddress: { tries: 60, minutes: 10 },
    perAddressDay: { tries: 300, minutes: 1_440 },
    /**
     * Declined cards: this many, and new gifts wait until the oldest is this old. An address gets far more than an
     * email, so a few declines on a shared office or mobile network address don't stop everyone behind it.
     */
    declinesPerEmail: { tries: 3, minutes: 60 },
    /** Raised from 15 on 12/11/2026, for shared mobile-network addresses. A starting value for Yehuda to confirm. */
    declinesPerAddress: { tries: 30, minutes: 60 },
    /** Alarms for the Givezy team (an email and Admin, Payments); these never stop anyone giving. */
    charityStartsAlarm: { tries: 60, minutes: 10 },
    charityDeclinesAlarm: { tries: 10, minutes: 60 },
    /** A give form sent sooner than this after the page opened is asked to press Give again (bots fill forms instantly). */
    minFillSeconds: 3,
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

