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
   * NEDIV lev, which then owes the charity its line.
   */
  charityAccountRef: string | null;
  email: string;
  /** Where the donor returns after paying. */
  returnUrl: string;
  description: string;
};

export type TransactionStatus = "success" | "failed" | "pending";

export type VerifiedTransaction = {
  reference: string;
  status: TransactionStatus;
  amountCents: number;
  currency: string;
  /** The gateway's own id for the payment. */
  gatewayTransactionId: string;
  /** When the gateway says the payment went through, if it says. */
  paidAt?: string | null;
};

export type WebhookEvent = {
  /** Unique per event, for idempotency. */
  eventId: string;
  type: "payment_succeeded" | "payment_failed" | "other";
  reference: string | null;
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
  /** Ask the gateway directly whether a payment went through. */
  verifyTransaction(reference: string): Promise<VerifiedTransaction>;
  /** Check a webhook's signature and read it. Returns null if the signature is wrong. */
  parseWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent | null>;
  /** Register a charity's settlement bank account. Returns the gateway's reference. */
  createCharityAccount(req: CharityAccountRequest): Promise<{ accountRef: string }>;
}

export class GatewayError extends Error {}
