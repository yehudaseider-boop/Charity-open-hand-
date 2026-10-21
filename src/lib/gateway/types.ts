/**
 * The payment gateway adapter. Nothing outside src/lib/gateway may refer to
 * a specific gateway; everything goes through this interface.
 */

export type CheckoutRequest = {
  /** Our reference for the payment (unique per donation). */
  reference: string;
  /** What the donor pays, in cents: the two lines below added together. */
  totalCents: number;
  /** The separate line items, always recorded apart. */
  lines: { charityCents: number; contributionCents: number };
  /**
   * The charity's own account at the gateway, only when this gateway splits
   * payments (see `splitsPayments`). Null means the whole payment settles to
   * Givezy, which then owes the charity its line.
   */
  charityAccountRef: string | null;
  /**
   * Who pays the gateway's own charge when a payment is split: the charity (out of its
   * donation) or Givezy (out of its share). Decided by Yehuda; null until then, and a
   * split payment is never started without it.
   */
  feeBearer: "charity" | "nediv_lev" | null;
  email: string;
  /**
   * The donor is starting a monthly donation: take the payment by card only, so the gateway
   * returns a reusable card authorisation (see `VerifiedTransaction.authorization`).
   */
  saveCard?: boolean;
  /** Where the donor returns after paying. */
  returnUrl: string;
  description: string;
};

export type TransactionStatus = "success" | "failed" | "pending";

/** A card the donor allowed us to charge again (monthly donations). A secret: store it encrypted, never show it. */
export type CardAuthorization = {
  code: string;
  /** False when the gateway will not let us charge this card again (not every payment method can be reused). */
  reusable: boolean;
  last4: string | null;
  brand: string | null;
  /** "mm/yyyy" */
  expires: string | null;
};

export type VerifiedTransaction = {
  reference: string;
  status: TransactionStatus;
  amountCents: number;
  currency: string;
  /** The gateway's own id for the payment. */
  gatewayTransactionId: string;
  /** When the gateway says the payment went through, if it says. */
  paidAt?: string | null;
  /** The card used, when the gateway returns one that can be charged again. */
  authorization?: CardAuthorization | null;
};

export type ChargeRequest = {
  /** Our reference for this charge (unique per attempt); the donation id. */
  reference: string;
  authorizationCode: string;
  email: string;
  totalCents: number;
  lines: { charityCents: number; contributionCents: number };
  charityAccountRef: string | null;
  feeBearer: "charity" | "nediv_lev" | null;
  description: string;
  /** A monthly collection (the default) or a once-off gift charged to the donor's saved card. Recorded with the charge. */
  monthly?: boolean;
};

export type WebhookEvent = {
  /** Unique per event, for idempotency. */
  eventId: string;
  /**
   * What happened. A refund or dispute names the original payment in `reference`. Only a full refund is
   * acted on by itself; partial refunds and disputes are held for a person (see donations/reverse.ts).
   */
  type: "payment_succeeded" | "payment_failed" | "refund_processed" | "dispute_opened" | "dispute_resolved" | "other";
  reference: string | null;
  /** For a refund: the amount refunded, in cents, when the gateway says. */
  amountCents?: number | null;
  /** For a refund: the currency of that amount, when the gateway says ("ZAR"). Anything else is held for a person. */
  currency?: string | null;
  /** For a resolved dispute: the gateway's own word for the outcome, kept for the person who checks it. */
  detail?: string | null;
  raw: unknown;
};

export type CharityAccountRequest = {
  charityId: string;
  businessName: string;
  bankName: string;
  accountNumber: string;
  branchCode: string;
  accountHolder: string;
};

export interface PaymentGateway {
  /** Short name stored on donations and charities, e.g. "test". */
  readonly name: string;
  /**
   * Can this gateway pay the charity's line straight into the charity's own
   * account (a split payment)? Never assumed: set per gateway only once it is
   * confirmed for South African merchants.
   */
  readonly splitsPayments: boolean;
  /** Start a hosted checkout. Returns the page to send the donor to. */
  createCheckout(req: CheckoutRequest): Promise<{ redirectUrl: string }>;
  /**
   * Charge a card the donor authorised earlier (a monthly donation). The answer is only a
   * first indication: the result is always confirmed with `verifyTransaction` before it counts.
   */
  chargeAuthorization(req: ChargeRequest): Promise<{ status: TransactionStatus }>;
  /** Ask the gateway directly whether a payment went through. */
  verifyTransaction(reference: string): Promise<VerifiedTransaction>;
  /** Check a webhook's signature and read it. Returns null if the signature is wrong. */
  parseWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent | null>;
  /** Register a charity's settlement bank account. Returns the gateway's reference. */
  createCharityAccount(req: CharityAccountRequest): Promise<{ accountRef: string }>;
}

export class GatewayError extends Error {
  /** True when the gateway says it has no record of the reference (it never received the payment). */
  readonly notFound: boolean;
  /**
   * True when the gateway answered and turned the request down (for example a card authorisation it
   * will no longer charge). False for "never received", timeouts, network failures and outages.
   */
  readonly refused: boolean;
  constructor(message: string, opts: { notFound?: boolean; refused?: boolean } = {}) {
    super(message);
    this.notFound = opts.notFound ?? false;
    this.refused = opts.refused ?? false;
  }
}

/** The gateway answered and said no, as opposed to never receiving the request or being unreachable. */
export function isGatewayRefusal(e: unknown): boolean {
  return e instanceof GatewayError && e.refused;
}

/** The gateway has never heard of this payment, as opposed to being unreachable or failing. */
export function isGatewayNotFound(e: unknown): boolean {
  return e instanceof GatewayError && e.notFound;
}
