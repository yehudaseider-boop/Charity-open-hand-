/**
 * Givezy charity portal (DEMO): the shapes the portal screens read.
 *
 * These mirror what the real, authenticated API will return, so the mock layer in
 * `service.ts` can later be swapped for real calls without touching the screens.
 * Money is integer cents in ZAR. Dates are ISO strings (UTC); screens show them in
 * Johannesburg time as dd/mm/yyyy.
 */

export type CharitySize = "small" | "medium" | "large";

export type VerificationStatus = "verified" | "in_review" | "action_needed";

export type DemoCharity = {
  id: string;
  name: string;
  shortName: string;
  size: CharitySize;
  cause: string;
  city: string;
  tagline: string;
  npoNumber: string;
  pboNumber: string | null;
  s18a: boolean;
  verification: VerificationStatus;
  publicSlug: string;
  contactEmail: string;
  contactPhone: string;
  bankName: string;
  bankLast4: string;
  /** Initials for the placeholder logo tile. */
  initials: string;
};

export type CampaignStatus = "draft" | "active" | "paused" | "ended";

export type Campaign = {
  id: string;
  charityId: string;
  name: string;
  slug: string;
  summary: string;
  goalCents: number;
  /** yyyy-mm-dd, Johannesburg calendar days. */
  startDate: string;
  endDate: string | null;
  status: CampaignStatus;
  createdAt: string;
};

/**
 * The platform's donation statuses. Charities see only paid, refunded and charged-back donations
 * (decided 08/10/2026: no details of abandoned or failed payments); pending and failed exist in the
 * data but never reach a charity screen.
 */
export type DonationStatus = "paid" | "pending" | "failed" | "refunded" | "charged_back";

export type Donor = {
  id: string;
  charityId: string;
  firstName: string;
  lastName: string;
  email: string;
  city: string;
  type: "individual" | "company";
  /** The donor ticked "Anonymous" on at least one donation (hides the name on public pages only). */
  prefersAnonymous: boolean;
};

export type Donation = {
  id: string;
  /** Short reference a charity can quote to support. */
  ref: string;
  charityId: string;
  donorId: string;
  campaignId: string | null;
  recurringId: string | null;
  kind: "once" | "monthly";
  status: DonationStatus;
  /** What the donor gave to the charity. */
  amountCents: number;
  /** Processing fee on this donation (DEMO placeholder rate, see `demo-config.ts`). */
  processingFeeCents: number;
  /** Givezy charges no platform fee (decided 08/10/2026). Kept as a field so the screens show it. */
  platformFeeCents: number;
  /** When the donor gave. */
  donatedAt: string;
  /** When the payment provider settled it to the charity's account (paid and refunded only). */
  settledAt: string | null;
  /** The payout it arrived in. Null while still pending settlement. */
  payoutId: string | null;
  refundedAt: string | null;
  /** When the card holder's bank reversed the payment. */
  chargedBackAt: string | null;
  /** The donor's message to the charity, if they wrote one (charities see it). */
  message: string | null;
  wants18a: boolean;
  anonymous: boolean;
  /** Not recorded by the platform today, so never shown. Kept so the demo data stays stable. */
  channel: "app" | "website";
  /** Not stored by the platform, so never shown. */
  cardLast4: string;
  failureReason: string | null;
};

/** The platform's monthly-donation statuses. "failed": stopped after three declined attempts in a month. */
export type RecurringStatus = "active" | "paused" | "cancelled" | "failed";

export type RecurringPlan = {
  id: string;
  charityId: string;
  donorId: string;
  campaignId: string | null;
  amountCents: number;
  dayOfMonth: number;
  startedAt: string;
  status: RecurringStatus;
  cancelledAt: string | null;
  pausedAt: string | null;
  failedAt: string | null;
};

export type PayoutStatus = "paid" | "in_transit";

export type Payout = {
  id: string;
  ref: string;
  charityId: string;
  /** Settlements from this date ... */
  periodStart: string;
  /** ... to this date (inclusive). */
  periodEnd: string;
  /** When the payment provider sent it. */
  sentDate: string;
  /** When the money arrives in the charity's bank account. */
  payoutDate: string;
  status: PayoutStatus;
  grossCents: number;
  feesCents: number;
  refundsCents: number;
  netCents: number;
  donationCount: number;
};

export type TeamRole = "owner" | "admin" | "finance" | "viewer";

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  status: "active" | "invited";
  lastActive: string | null;
  twoStep: boolean;
};

export type DemoDataset = {
  charity: DemoCharity;
  campaigns: Campaign[];
  donors: Donor[];
  donations: Donation[];
  recurring: RecurringPlan[];
  payouts: Payout[];
  team: TeamMember[];
};
