import "server-only";
import { createHmac } from "node:crypto";
import { emailHash } from "@/lib/email-fingerprint";
import { sameSecret } from "@/lib/secret-compare";
import { gatewayTimeoutOverride } from "./timeout";
import { GatewayError, type CardAuthorization, type ChargeRequest, type CheckoutRequest, type PaymentGateway, type VerifiedTransaction, type WebhookEvent } from "./types";

/**
 * Stitch adapter (decided 18/11/2026: Givezy moves from Paystack to Stitch).
 *
 * NOT YET RUN AGAINST STITCH'S TEST SYSTEM: Stitch issues test access with Givezy's own onboarding. Written to
 * Stitch's published docs (docs.stitch.money, read 17/11/2026 and in full 26/11/2026, see docs/stitch-docs-review.md); points to check in the test system are marked VERIFY.
 *
 * How a once-off gift works here (https://docs.stitch.money/payment-products/payins/card/once-off/hosted-ui and
 * .../card/split-settlements/integration):
 * 1. We ask for a payment request (a GraphQL mutation) with our own reference as `externalReference`, the whole
 *    amount, and a split: the charity's line goes to the charity's own Stitch merchant (`splitSettlements`), the rest
 *    stays with Givezy's main account. The answer carries the hosted page's address.
 * 2. The donor pays on Stitch's page (card, Apple Pay, Google Pay) and comes back to our return address.
 * 3. We never trust the return or the webhook's words: the payment is looked up by our reference and only a
 *    "completed" payment request counts (the same rule as every gateway here).
 * Each side is settled net of its own fee ("each", decided 09/11/2026), so Stitch can only do the "each" way.
 *
 * Splitting is a switch, STITCH_SPLITS=yes, and a payment always names a charity's Stitch merchant: Stitch needs a
 * destination, and without a split the whole amount would settle to Givezy.
 *
 * Saved cards and monthly gifts (built 26/11/2026 from the docs, own switch STITCH_SAVED_CARDS=yes, off by default):
 * the first gift is a card "consent" on Stitch's page (`paymentConsentRequestCreate`) whose first charge carries our
 * reference and the split; later gifts are charged by our server (`initiateTransaction` with the consent id as the
 * token, `source: merchant`, the consent id as the agreement reference, the split on every charge). Payments made
 * that way are looked up as transactions by our reference.
 *
 * Refunds and disputes arrive as events and are looked up at Stitch before they count (the refund or the disputed
 * payment, by Stitch's own id, gives our reference and the amount). Refunds are made in Stitch's dashboard; there is
 * no refund button here.
 *
 * NOT BUILT (nothing in the docs to build it on): a charity's deposits (no payout report per charity is documented),
 * registering a charity from our side (Stitch sets charities up; the merchant API is documented only for in-person
 * payments).
 */

const TOKEN_URL = "https://secure.stitch.money/connect/token";
const API = "https://api.stitch.money/graphql";
/** How long to wait for Stitch before giving up on a call (it is then treated as unreachable, never as refused). */
const TIMEOUT_MS = 20_000;
/**
 * How long a payment page stays open. Stitch "highly recommends" an expiry on every payment request: an unpaid one then
 * becomes "expired" instead of staying pending for ever (closing the page does not cancel it). Two hours is our own
 * choice: room for a slow 3DS step in a banking app, short enough that the daily check can close it the same day.
 */
const PAYMENT_PAGE_MINUTES = 120;
/** A webhook older than this is refused (a captured message replayed later). Svix's own default. */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

function setting(name: "STITCH_CLIENT_ID" | "STITCH_CLIENT_SECRET" | "STITCH_WEBHOOK_SECRET"): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}. See .env.example.`);
  return v;
}

const unreachable = (what: string, e: unknown) =>
  new GatewayError(`Stitch ${what} could not be reached: ${e instanceof Error ? e.message : String(e)}`, { unreachable: true });

/** Client tokens, kept until shortly before they expire (they last an hour by default). Keyed by the scopes asked for. */
const tokens = new Map<string, { value: string; expiresAt: number }>();

/** A client token for these scopes (https://docs.stitch.money/authentication/client-tokens). */
export async function clientToken(scopes: string[], now = Date.now()): Promise<string> {
  const key = [...scopes].sort().join(" ");
  const kept = tokens.get(key);
  if (kept && kept.expiresAt - 60_000 > now) return kept.value;
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: setting("STITCH_CLIENT_ID"),
        client_secret: setting("STITCH_CLIENT_SECRET"),
        scope: key,
        audience: TOKEN_URL,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(gatewayTimeoutOverride() ?? TIMEOUT_MS),
    });
  } catch (e) {
    throw unreachable("sign-in", e);
  }
  const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: string } | null;
  // Our own credentials or scopes were not accepted: a set-up problem, never the donor's card.
  if (!res.ok || !body?.access_token) throw new GatewayError(`Stitch sign-in failed: ${body?.error ?? res.status}`);
  tokens.set(key, { value: body.access_token, expiresAt: now + (Number.isFinite(body.expires_in) ? Number(body.expires_in) : 3600) * 1000 });
  return body.access_token;
}

/** Forget kept tokens (tests, and after a sign-in problem). */
export function forgetTokens(): void {
  tokens.clear();
}

type GraphQLAnswer<T> = { data?: T; errors?: { message?: string; extensions?: { code?: string } }[] };

/** Words that mean Stitch didn't accept who we are or what we may do (our set-up), not the request itself. */
const NOT_ALLOWED = /unauthori[sz]ed|unauthenticated|forbidden|scope|token|permission|not enabled|not authori[sz]ed/i;
/** Errors that mean our own query or variables are wrong (a bug here, never the donor's card or the amount). */
const OUR_MISTAKE_CODES = new Set(["GRAPHQL_VALIDATION_FAILED", "GRAPHQL_PARSE_FAILED", "INTERNAL_SERVER_ERROR", "UNAUTHENTICATED", "FORBIDDEN"]);
const OUR_MISTAKE_WORDS = /cannot query field|unknown (argument|type|field)|variable "?\$?\w+"? (of type|expected|got|is)|syntax error|must have a selection|is not defined by type/i;

/**
 * One GraphQL call. `idempotencyKey`: Stitch replays the first answer for a byte-identical retry within 24 hours
 * (docs.stitch.money/idempotency); only for calls whose body never changes between tries.
 */
async function graphql<T>(what: string, scopes: string[], query: string, variables: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const token = await clientToken(scopes);
  let res: Response;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
      signal: AbortSignal.timeout(gatewayTimeoutOverride() ?? TIMEOUT_MS),
    });
  } catch (e) {
    // Network failure or timeout: the outcome is unknown, so it is neither "not found" nor "refused".
    throw unreachable(what, e);
  }
  if (res.status === 401) tokens.clear();
  const body = (await res.json().catch(() => null)) as GraphQLAnswer<T> | null;
  if (!res.ok || !body) {
    // A 401 or 403 is our credentials or scopes, a 5xx or 429 is Stitch struggling: outages, never a refusal.
    throw new GatewayError(`Stitch ${what} failed: ${res.status}`);
  }
  if (body.errors?.length) {
    const said = body.errors.map((e) => e.message ?? "").filter(Boolean).join("; ").slice(0, 300) || "an error";
    // Stitch answered and turned the request down for what is in it (an amount, a split, a merchant): a refusal. When
    // it says we may not do this at all, or our own query or variables are wrong, it is our set-up or a bug instead.
    const ours = body.errors.some((e) => OUR_MISTAKE_CODES.has(String(e.extensions?.code ?? ""))) || OUR_MISTAKE_WORDS.test(said);
    throw new GatewayError(`Stitch ${what} failed: ${said}`, { refused: !ours && !NOT_ALLOWED.test(said), said });
  }
  if (!body.data) throw new GatewayError(`Stitch ${what} gave no answer.`);
  return body.data;
}

/** Whole cents as the decimal rand amount Stitch takes ("203.45"), never through a float. */
export function centsToQuantity(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new GatewayError("An amount must be a whole number of cents.");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** A rand amount from Stitch (a string such as "1" or "203.45", or a number) as whole cents; null if it is anything else. */
export function quantityToCents(v: unknown): number | null {
  const text = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : typeof v === "string" ? v.trim() : "";
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}


type Money = { quantity?: unknown; currency?: string } | null | undefined;

/**
 * Who the donor is, for Stitch's fraud checks: Stitch asks for a `payerId` on every request, "any internal identifier
 * that always uniquely identifies users". The email is the only identity a gift has (guests included), so the id is the
 * address's keyed fingerprint (the one way Givezy turns an address into a value, ../email-fingerprint): the same donor
 * always has the same id, and nobody without our key can tell whose it is. Without the key nothing is sent.
 */
export function payerIdFor(email: string): string {
  let hash: string;
  try {
    hash = emailHash(email);
  } catch (e) {
    throw new GatewayError(`The donor's id for the payment provider could not be made: ${e instanceof Error ? e.message : String(e)}`, { beforeSend: true });
  }
  return `donor-${hash.slice(0, 32)}`;
}

/** Saved cards and monthly gifts on Stitch: off until STITCH_SAVED_CARDS=yes (needs card consents switched on by Stitch). */
function savedCardsOn(): boolean {
  return process.env.STITCH_SAVED_CARDS === "yes";
}

/**
 * The checks every payment shares before anything is sent: Stitch only takes a gift as a split to the charity, each
 * side pays its own fee, and the two lines make up the whole payment. Each refusal is `beforeSend`: nothing was charged.
 */
function checkSplit(req: Pick<CheckoutRequest, "charityAccountRef" | "feeBearer" | "lines" | "totalCents">): void {
  const stop = (message: string) => new GatewayError(message, { beforeSend: true });
  if (!stitchGateway.splitsPayments) throw stop("Stitch takes payments only as a split to a charity's account, and splitting is not switched on, so nothing was started.");
  if (!req.charityAccountRef) throw stop("This charity has no Stitch account, so the payment was not started (it would not reach the charity).");
  // Stitch settles each side net of its own fee: each side pays it on its own share.
  if (req.feeBearer !== "each") throw stop("Stitch takes each side's charge on its own share, so a split payment can only start when the gateway charge is paid by each (the platform setting).");
  if (!Number.isSafeInteger(req.lines.charityCents) || req.lines.charityCents <= 0) throw stop("The charity's share must be a whole number of cents.");
  if (!Number.isSafeInteger(req.lines.contributionCents) || req.lines.contributionCents < 0) throw stop("The contribution must be a whole number of cents.");
  // The two lines must make up the whole payment: anything left over would sit with Givezy.
  if (req.lines.charityCents + req.lines.contributionCents !== req.totalCents) throw stop("The charity's line and the contribution do not add up to the total, so the payment was not started.");
}

/** The split Stitch takes: the charity's line to its own merchant, the rest stays with Givezy. Never a top-level merchant. */
function splitFor(req: Pick<CheckoutRequest, "charityAccountRef" | "lines">) {
  return [{ merchantId: req.charityAccountRef, amount: { quantity: centsToQuantity(req.lines.charityCents), currency: "ZAR" } }];
}

const CREATE_PAYMENT = `
mutation CreatePaymentRequest($amount: MoneyInput!, $externalReference: String!, $payerReference: String!, $beneficiaryReference: String!, $expireAt: Date, $splitSettlements: [SplitSettlementInput!], $paymentMethods: PaymentMethodsInput, $payerInformation: PayerInformationInput) {
  clientPaymentInitiationRequestCreate(input: {
    amount: $amount, externalReference: $externalReference, payerReference: $payerReference,
    beneficiaryReference: $beneficiaryReference, expireAt: $expireAt, splitSettlements: $splitSettlements,
    paymentMethods: $paymentMethods, payerInformation: $payerInformation
  }) { paymentInitiationRequest { id url } }
}`;

/**
 * A card consent: Stitch's page saves the card and takes the first gift (`initialCharge`) in one go. The first charge
 * carries our reference, so it can be looked up as a transaction; the split applies to that first charge only
 * (Stitch's docs), and every later charge sends its own.
 */
const CREATE_CONSENT = `
mutation CreateConsent($input: CreatePaymentConsentRequestInput!) {
  paymentConsentRequestCreate(input: $input) { id url }
}`;

/** A charge we start on a saved card (a monthly gift, or a once-off gift on a saved card). */
const CHARGE_SAVED_CARD = `
mutation ChargeSavedCard($input: TransactionInitiateInput!) {
  initiateTransaction(input: $input) {
    __typename id
    state { __typename ... on TransactionFailure { reason reasonDescription } ... on TransactionPending { reason } }
  }
}`;

/**
 * Look up a payment request by our own reference. `amount` is Stitch's `Money` scalar: it is asked for as a whole and
 * comes back as `{ quantity, currency }` (selecting sub-fields on it is refused before the query runs; fixed 26/11/2026,
 * see docs/stitch-docs-review.md). `splitSettlements` names the charity merchant the payment was split to.
 * VERIFY in the test system: the docs list the `externalReference` filter but show no worked example for it.
 */
const FIND_PAYMENT = `
query FindPayment($ref: String!) {
  client {
    paymentInitiationRequests(filter: { externalReference: { eq: $ref } }) {
      edges { node {
        id externalReference
        splitSettlements { merchantId }
        state {
          __typename
          ... on PaymentInitiationRequestCompleted { date amount payer { __typename ... on PaymentInitiationCardPayer { network last4 } ... on PaymentInitiationWalletPayer { network last4 } } }
          ... on PaymentInitiationRequestCancelled { date reason }
          ... on PaymentInitiationRequestExpired { date }
        }
      } }
    }
  }
}`;

/**
 * Look up a charge on a saved card (and the first charge of a card consent) by our own reference.
 * VERIFY in the test system: the scope this query needs (the docs don't say; `transaction_initiate` is assumed).
 */
const FIND_TRANSACTION = `
query FindTransaction($ref: String!) {
  client {
    transactions(filter: { externalReference: { eq: $ref } }) {
      edges { node {
        __typename id externalReference amount
        state { __typename ... on TransactionSuccess { date } ... on TransactionFailure { reason } ... on TransactionPending { reason } }
        paymentConsentRequest { id status { __typename } }
        ... on CardTransaction { card { network last4 expiryMonth expiryYear } splitSettlements { merchantId } }
      } }
    }
  }
}`;

/**
 * A transaction by Stitch's own id: a refund (to find the gift it refunds and how much) or a disputed payment (to
 * find the gift). VERIFY in the test system: the scope a `node` lookup of a transaction needs.
 */
const FIND_BY_ID = `
query FindTransactionById($id: ID!) {
  node(id: $id) {
    __typename
    ... on PaymentTransaction {
      id amount externalReference
      state { __typename }
      paymentInitiationRequest { externalReference }
      originalTransaction { externalReference paymentInitiationRequest { externalReference } }
    }
  }
}`;

/** Scopes: payment requests; charges on saved cards and transaction lookups; consents; refunds. */
const SCOPE_PAYMENT_REQUEST = ["client_paymentrequest"];
const SCOPE_TRANSACTION = ["transaction_initiate"];
const SCOPE_CONSENT = ["client_recurringpaymentconsentrequest"];
const SCOPE_REFUND = ["client_refund"];

type PaymentNode = {
  id?: string;
  externalReference?: string | null;
  splitSettlements?: { merchantId?: string | null }[] | null;
  state?: { __typename?: string; date?: string; amount?: Money; payer?: { network?: string | null; last4?: string | null } | null } | null;
};

type TransactionNode = {
  __typename?: string;
  id?: string;
  externalReference?: string | null;
  amount?: Money;
  state?: { __typename?: string; date?: string; reason?: string; reasonDescription?: string | null } | null;
  paymentConsentRequest?: { id?: string; status?: { __typename?: string } | null } | null;
  card?: { network?: string | null; last4?: string | null; expiryMonth?: number | null; expiryYear?: number | null } | null;
  splitSettlements?: { merchantId?: string | null }[] | null;
};

type ByIdNode = {
  __typename?: string;
  id?: string;
  amount?: Money;
  externalReference?: string | null;
  state?: { __typename?: string } | null;
  paymentInitiationRequest?: { externalReference?: string | null } | null;
  originalTransaction?: { externalReference?: string | null; paymentInitiationRequest?: { externalReference?: string | null } | null } | null;
};

/** Transaction kinds that are payments, as GraphQL types and as the `transaction` event's `data.type`. */
const PAYMENT_TYPENAMES = new Set(["CardTransaction", "ApplePayTransaction", "GooglePayTransaction", "SamsungPayTransaction"]);
const PAYMENT_TRANSACTION_KINDS = new Set(["CARD", "APPLE_PAY", "GOOGLE_PAY", "SAMSUNG_PAY"]);
/** Refunds, as GraphQL types. */
const REFUND_TYPENAMES = new Set(["CardRefundTransaction", "WalletRefundTransaction"]);

/**
 * Why a charge failed, when the reason is the card itself: declined by the bank, or a card (or saved card) that can no
 * longer be charged. Any other failure reason (a set-up problem, an outage) is never told to the donor as a decline.
 */
const DECLINE_REASONS = new Set([
  "insufficientFunds",
  "exceedsCardWithdrawalLimit",
  "authorizationFailed",
  "invalidCardError",
  "restrictedCard",
  "restrictedCountryCode",
  "issuerValidationFailed",
  "issuerVerificationFailed",
  "secure3dDeclined",
  "secure3dNotCompleted",
  "invalidConsentRequest",
]);

/** The payment page's address with our return address added (it must be on Stitch's allowed list). */
function hostedUrl(url: string, returnUrl: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new GatewayError("Stitch gave a payment page address we can't read.");
  }
  if (u.protocol !== "https:") throw new GatewayError("Stitch gave a payment page that isn't on a secure address.");
  // VERIFY in the test system: that Stitch honours both, and that the return address must be on its allowed list.
  u.searchParams.set("redirect_uri", returnUrl);
  // Closed or failed: back to the same place, where the payment is looked up (the page's own word is never trusted).
  u.searchParams.set("failure_redirect_uri", returnUrl);
  return u.toString();
}

/** The merchant ids a payment says it was split to (the charity's account, if all went as asked). */
function merchantsOf(splits: { merchantId?: string | null }[] | null | undefined): string[] {
  return (splits ?? []).map((s) => s.merchantId).filter((m): m is string => typeof m === "string" && m.length > 0);
}

/** A saved card's details for our records: the consent id is what we charge later. */
function authorizationOf(node: TransactionNode): CardAuthorization | null {
  const consent = node.paymentConsentRequest;
  if (!consent?.id) return null;
  const card = node.card ?? null;
  const month = card?.expiryMonth;
  const year = card?.expiryYear;
  const fullYear = typeof year === "number" ? (year < 100 ? 2000 + year : year) : null;
  return {
    code: consent.id,
    // Only a granted consent can be charged again (Stitch refuses a charge on any other).
    reusable: consent.status?.__typename === "PaymentConsentGranted",
    last4: card?.last4 ?? null,
    brand: card?.network ? card.network.toLowerCase() : null,
    expires: typeof month === "number" && fullYear ? `${String(month).padStart(2, "0")}/${fullYear}` : null,
  };
}

/** A hosted payment request, as a verified transaction. */
function fromPaymentRequest(reference: string, node: PaymentNode): VerifiedTransaction {
  const state = node.state?.__typename ?? "";
  const settledTo = merchantsOf(node.splitSettlements);
  if (state === "PaymentInitiationRequestCompleted") {
    const cents = quantityToCents(node.state?.amount?.quantity);
    if (cents === null) throw new GatewayError("Stitch gave a payment amount we can't read.");
    return {
      reference,
      status: "success",
      amountCents: cents,
      currency: node.state?.amount?.currency === "ZAR" ? "ZAR" : String(node.state?.amount?.currency ?? ""),
      gatewayTransactionId: String(node.id ?? ""),
      paidAt: node.state?.date ?? null,
      authorization: null,
      channel: "card",
      settledTo,
    };
  }
  // Cancelled, expired, or "completed by hand" (Stitch's words: "No payment exists"): not paid, and never a declined
  // card. Pending and "abandoned", so only the daily check closes it, and it is never counted against the donor. A donor
  // who just closes the page leaves the request pending (Stitch's docs: it is cancelled only if we cancel it or Stitch
  // switches on cancel-on-close), which is why every request has an expiry. A card turned down on Stitch's page also
  // leaves it open for another try.
  const left = state === "PaymentInitiationRequestCancelled" || state === "PaymentInitiationRequestExpired" || state === "PaymentInitiationRequestManuallyCompleted";
  return { reference, status: "pending", amountCents: 0, currency: "ZAR", gatewayTransactionId: String(node.id ?? ""), paidAt: null, authorization: null, channel: null, abandoned: left, settledTo };
}

/** A charge on a saved card (or a consent's first charge), as a verified transaction. */
function fromTransaction(reference: string, node: TransactionNode): VerifiedTransaction {
  const state = node.state?.__typename ?? "";
  const id = String(node.id ?? "");
  const authorization = authorizationOf(node);
  const settledTo = merchantsOf(node.splitSettlements);
  if (state === "TransactionSuccess") {
    const cents = quantityToCents(node.amount?.quantity);
    if (cents === null) throw new GatewayError("Stitch gave a payment amount we can't read.");
    return {
      reference,
      status: "success",
      amountCents: cents,
      currency: node.amount?.currency === "ZAR" ? "ZAR" : String(node.amount?.currency ?? ""),
      gatewayTransactionId: id,
      paidAt: node.state?.date ?? null,
      authorization,
      channel: "card",
      settledTo,
    };
  }
  if (state === "TransactionFailure") {
    return { reference, status: "failed", amountCents: 0, currency: "ZAR", gatewayTransactionId: id, paidAt: null, authorization, channel: null, settledTo };
  }
  // Pending (for example waiting for a 3DS step), or cancelled (only a preauthorisation can be): not paid, not declined.
  return { reference, status: "pending", amountCents: 0, currency: "ZAR", gatewayTransactionId: id, paidAt: null, authorization, channel: null, abandoned: state === "TransactionCancelled", settledTo };
}

/**
 * Our reference for the payment a refund or a dispute is about, looked up at Stitch by Stitch's own id. For a refund the
 * gift is the original payment; for a dispute the transaction is the payment itself. Null when Stitch has no such
 * transaction or doesn't say. An outage is thrown, so the event is sent again.
 */
async function lookUpById(id: string, scopes: string[]): Promise<ByIdNode | null> {
  try {
    const data = await graphql<{ node?: ByIdNode | null }>("transaction lookup", scopes, FIND_BY_ID, { id });
    return data.node ?? null;
  } catch (e) {
    if (e instanceof GatewayError && !e.unreachable && e.refused) return null;
    throw e;
  }
}

/** Stitch's webhook signature (Svix): HMAC-SHA256 of "id.timestamp.body" with the secret's bytes, base64, "v1,<sig>". */
export function webhookSignature(secret: string, id: string, timestamp: string, rawBody: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
}

/** Dispute events (a Stitch "Technical Preview"): the opening event and the four closing ones. */
const DISPUTE_CLOSED = new Set(["dispute.won", "dispute.lost", "dispute.auto_accepted", "dispute.partially_accepted"]);

export const stitchGateway: PaymentGateway = {
  name: "stitch",
  /** Off until STITCH_SPLITS=yes, set once splitting is switched on by Stitch and confirmed in the test system. */
  get splitsPayments() {
    return process.env.STITCH_SPLITS === "yes";
  },
  /** Off until STITCH_SAVED_CARDS=yes: the website and the app say so before anything is recorded. */
  get supportsSavedCards() {
    return savedCardsOn();
  },
  /** Stitch names the merchant a payment was split to, so a gift is only paid when that is the charity's own account. */
  reportsSplit: true,

  async createCheckout(req: CheckoutRequest) {
    if (req.saveCard && !savedCardsOn()) {
      throw new GatewayError("Saving a card is not set up on this payment provider yet, so nothing was started.", { beforeSend: true });
    }
    checkSplit(req);
    const expireAt = new Date(Date.now() + PAYMENT_PAGE_MINUTES * 60_000).toISOString();
    const payerInformation = { payerId: payerIdFor(req.email), email: req.email };
    const amount = { quantity: centsToQuantity(req.totalCents), currency: "ZAR" };

    if (req.saveCard) {
      // Card only: a consent is a saved card. The first gift is taken on Stitch's page while the donor is there.
      const data = await graphql<{ paymentConsentRequestCreate?: { id?: string; url?: string } | null }>("card consent", SCOPE_CONSENT, CREATE_CONSENT, {
        input: {
          nonce: req.reference,
          externalReference: req.reference,
          payerInformation,
          expireAt,
          splitSettlements: splitFor(req),
          paymentMethods: { card: { enabled: true, initialCharge: { amount, nonce: req.reference, externalReference: req.reference } } },
        },
      });
      const made = data.paymentConsentRequestCreate;
      if (!made?.url) throw new GatewayError("Stitch gave no payment page, so nothing was started.");
      return { redirectUrl: hostedUrl(made.url, req.returnUrl) };
    }

    const data = await graphql<{ clientPaymentInitiationRequestCreate: { paymentInitiationRequest: { id: string; url: string } } }>(
      "payment request",
      SCOPE_PAYMENT_REQUEST,
      CREATE_PAYMENT,
      {
        amount,
        externalReference: req.reference,
        // Shown on the donor's statement and Stitch's records: at most 12 and 20 characters.
        payerReference: "Givezy",
        beneficiaryReference: `Gift ${req.reference.replace(/-/g, "").slice(0, 8)}`,
        expireAt,
        // Single destination, ZAR only. The destination goes inside the split, never as a top-level merchant.
        splitSettlements: splitFor(req),
        // Cards and the phone wallets on Stitch's page. Pay by Bank is switched off (it needs a bank beneficiary).
        paymentMethods: { card: { enabled: true }, applePay: { enabled: true }, googlePay: { enabled: true }, eft: { enabled: false } },
        payerInformation,
      },
    );
    const made = data.clientPaymentInitiationRequestCreate?.paymentInitiationRequest;
    if (!made?.url) throw new GatewayError("Stitch gave no payment page, so nothing was started.");
    return { redirectUrl: hostedUrl(made.url, req.returnUrl) };
  },

  async chargeAuthorization(req: ChargeRequest) {
    if (!savedCardsOn()) {
      throw new GatewayError("Charging a saved card is not set up on this payment provider yet, so nothing was charged.", { beforeSend: true });
    }
    checkSplit(req);
    if (!req.authorizationCode) throw new GatewayError("There is no saved card to charge, so nothing was charged.", { beforeSend: true });
    const input = {
      amount: { quantity: centsToQuantity(req.totalCents), currency: "ZAR" },
      // Our reference is both the nonce (Stitch refuses a second charge with it) and the reference we look it up by.
      nonce: req.reference,
      externalReference: req.reference,
      token: req.authorizationCode,
      payerInformation: { payerId: payerIdFor(req.email), email: req.email },
      splitSettlements: splitFor(req),
      paymentMethods: {
        card: {
          recurringPayment: {
            // We start this charge: the donor is not there. The consent id names the series (the same for every charge).
            source: "merchant",
            agreement: { reference: req.authorizationCode, variability: "variable", scenario: req.monthly === false ? "Unscheduled" : "Subscription" },
          },
        },
      },
    };
    // The same body every try, so a retry of the same charge gets Stitch's first answer back, never a second charge.
    const data = await graphql<{ initiateTransaction?: { state?: { __typename?: string; reason?: string; reasonDescription?: string | null } | null } | null }>(
      "saved card charge",
      SCOPE_TRANSACTION,
      CHARGE_SAVED_CARD,
      { input },
      `charge-${req.reference}`,
    );
    const state = data.initiateTransaction?.state;
    if (state?.__typename === "TransactionSuccess") return { status: "success" as const };
    if (state?.__typename === "TransactionFailure") {
      // The card itself: a decline. Anything else Stitch turned down is not the donor's card.
      if (DECLINE_REASONS.has(String(state.reason ?? ""))) return { status: "failed" as const };
      const said = [state.reason, state.reasonDescription].filter(Boolean).join(": ") || "a failure";
      throw new GatewayError(`Stitch turned the charge down: ${said}`, { refused: true, said });
    }
    // Pending (a 3DS step the donor isn't there to do, or Stitch still waiting on the bank): the payment check settles it.
    return { status: "pending" as const };
  },

  async verifyTransaction(reference): Promise<VerifiedTransaction> {
    const found = await graphql<{ client?: { paymentInitiationRequests?: { edges?: { node?: PaymentNode }[] } } }>(
      "payment lookup",
      SCOPE_PAYMENT_REQUEST,
      FIND_PAYMENT,
      { ref: reference },
    );
    const requests = (found.client?.paymentInitiationRequests?.edges ?? []).map((e) => e.node).filter((n): n is PaymentNode => Boolean(n));
    if (requests.length > 0) {
      // The answer must be about the payment we asked about (the filter is an equality, but never assume).
      const mine = requests.filter((n) => n.externalReference === reference);
      if (mine.length !== 1) throw new GatewayError(mine.length === 0 ? "Stitch answered about a different payment." : "Stitch holds more than one payment under this reference.");
      return fromPaymentRequest(reference, mine[0]);
    }
    // Not a payment page: a charge on a saved card, or a consent's first charge, carries our reference as a transaction.
    // Only looked for when saved cards are on (nothing else makes such a charge).
    if (!savedCardsOn()) throw new GatewayError("Stitch has no record of this payment.", { notFound: true });
    const tx = await graphql<{ client?: { transactions?: { edges?: { node?: TransactionNode | null }[] | null } } }>(
      "charge lookup",
      SCOPE_TRANSACTION,
      FIND_TRANSACTION,
      { ref: reference },
    );
    const charges = (tx.client?.transactions?.edges ?? [])
      .map((e) => e.node)
      .filter((n): n is TransactionNode => Boolean(n) && PAYMENT_TYPENAMES.has(String(n?.__typename ?? "")));
    // Stitch has nothing under this reference: it never received it.
    if (charges.length === 0) throw new GatewayError("Stitch has no record of this payment.", { notFound: true });
    const mine = charges.filter((n) => n.externalReference === reference);
    if (mine.length !== 1) throw new GatewayError(mine.length === 0 ? "Stitch answered about a different payment." : "Stitch holds more than one payment under this reference.");
    return fromTransaction(reference, mine[0]);
  },

  async parseWebhook(rawBody, headers): Promise<WebhookEvent | null> {
    // Svix's headers (`svix-*`), or the same message under the Standard Webhooks names (`webhook-*`): the same signature.
    // VERIFY in the test system which family Stitch sends.
    const pick = (name: string) => headers.get(`svix-${name}`) ?? headers.get(`webhook-${name}`) ?? "";
    const id = pick("id");
    const timestamp = pick("timestamp");
    const given = pick("signature");
    if (!id || !/^\d{9,12}$/.test(timestamp) || !given) return null;
    // A message older (or newer) than five minutes is a replay, not a delivery.
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return null;
    let want: string;
    try {
      want = webhookSignature(setting("STITCH_WEBHOOK_SECRET"), id, timestamp, rawBody);
    } catch {
      return null;
    }
    // "v1,<signature> v1,<other>": any one that matches is enough; each comparison is constant-time.
    const ok = given.split(" ").some((part) => {
      const [version, sig] = part.split(",");
      return version === "v1" && typeof sig === "string" && sameSecret(sig, want);
    });
    if (!ok) return null;

    let body: { id?: string; type?: string; data?: unknown };
    try {
      body = JSON.parse(rawBody) as typeof body;
    } catch {
      return null;
    }
    // Stitch's own examples of the `payment` event carry no top-level `type`, only the GraphQL-shaped
    // `data.client.paymentInitiationRequests.node`, so a body of that shape is read as a payment event too.
    const paymentNode = (body.data as { client?: { paymentInitiationRequests?: { node?: PaymentNode } } } | undefined)?.client?.paymentInitiationRequests?.node;
    const type = String(body.type ?? (paymentNode && typeof paymentNode === "object" ? "payment" : ""));
    // The message's own id (stable across Stitch's retries, different for every message): the body's id may be the
    // payment's own, shared by a first "pending" event and the later "completed" one, which would then be dropped as a
    // repeat. Dispute events have no id of their own at all.
    const eventId = `${type}:${id}`;
    let reference: string | null = null;
    let kind: WebhookEvent["type"] = "other";
    let amountCents: number | null = null;
    let currency: string | null = null;
    let detail: string | null = null;
    const extra: Record<string, string | null> = {};

    if (type === "payment") {
      // A completed payment request is the only thing that counts. A cancelled or expired one is left to the daily check.
      reference = typeof paymentNode?.externalReference === "string" ? paymentNode.externalReference : null;
      if (paymentNode?.state?.__typename === "PaymentInitiationRequestCompleted") kind = "payment_succeeded";
    } else if (type === "transaction") {
      const d = body.data as { id?: string; type?: string; status?: string; externalReference?: string | null } | undefined;
      const kindSaid = String(d?.type ?? "");
      if (PAYMENT_TRANSACTION_KINDS.has(kindSaid)) {
        // A successful card or wallet payment that carries our reference (a saved-card charge, or a consent's first
        // charge). A failed one is left alone: on Stitch's page a donor may try another card, and a saved-card charge is
        // settled by our own payment check. A transaction that doesn't say its kind is never trusted as a payment.
        reference = typeof d?.externalReference === "string" ? d.externalReference : null;
        if (d?.status === "SUCCESS" && reference) kind = "payment_succeeded";
      } else if (d?.status === "SUCCESS" && typeof d.id === "string" && d.id) {
        // Possibly a refund (card refunds come as "CARD_REFUND"; Stitch doesn't name the wallet one). Never taken on the
        // event's word: the transaction is looked up at Stitch, and only a successful refund counts, with Stitch's amount
        // and the reference of the gift it refunds (the refund's own reference is whatever was typed when it was made).
        const found = await lookUpById(d.id, SCOPE_REFUND);
        if (found && REFUND_TYPENAMES.has(String(found.__typename ?? "")) && found.state?.__typename === "TransactionSuccess") {
          kind = "refund_processed";
          reference = found.paymentInitiationRequest?.externalReference ?? found.originalTransaction?.paymentInitiationRequest?.externalReference ?? found.originalTransaction?.externalReference ?? null;
          amountCents = quantityToCents(found.amount?.quantity);
          currency = typeof found.amount?.currency === "string" ? found.amount.currency : null;
        } else if (!found && /REFUND/.test(kindSaid)) {
          // Stitch says it's a refund but the lookup found nothing: still a refund, held for a person (no reference).
          kind = "refund_processed";
        }
      }
    } else if (type === "payment-consent-request") {
      // A saved card's consent changed (granted, revoked, paused…). The money comes on the `transaction` event; a
      // revoked card is found at its next charge. Kept for the record with our reference.
      const d = body.data as { externalReference?: string | null; status?: string } | undefined;
      reference = typeof d?.externalReference === "string" ? d.externalReference : null;
      extra.status = typeof d?.status === "string" ? d.status : null;
    } else if (type === "dispute.created" || DISPUTE_CLOSED.has(type)) {
      // A chargeback (Stitch "Technical Preview"). The disputed payment is looked up at Stitch by its own id to find our
      // reference; a case covering several payments, or one Stitch can't place, is held for a person (no reference).
      const d = body.data as { disputeId?: string; caseReference?: string; status?: string; transactions?: { id?: string | null }[] } | undefined;
      kind = type === "dispute.created" ? "dispute_opened" : "dispute_resolved";
      detail = type === "dispute.created" ? null : (d?.status ?? type.replace("dispute.", ""));
      extra.disputeId = typeof d?.disputeId === "string" ? d.disputeId : null;
      extra.caseReference = typeof d?.caseReference === "string" ? d.caseReference : null;
      const txs = Array.isArray(d?.transactions) ? d.transactions : [];
      const only = txs.length === 1 && typeof txs[0]?.id === "string" ? txs[0].id : null;
      if (only) {
        const found = await lookUpById(only, SCOPE_TRANSACTION);
        if (found && PAYMENT_TYPENAMES.has(String(found.__typename ?? ""))) {
          reference = found.paymentInitiationRequest?.externalReference ?? found.externalReference ?? null;
        }
      }
    }
    return {
      eventId,
      type: kind,
      reference,
      amountCents,
      currency,
      detail,
      // What we keep of the event: never the whole body (a transaction carries the card's details).
      raw: { type, id, reference, ...extra },
    };
  },

  async createCharityAccount() {
    // Stitch sets each charity up itself (Admin types in the Stitch merchant id once Stitch has made it). The
    // merchant API is documented only for in-person payments and needs a scope Stitch switches on: ask Stitch.
    throw new GatewayError("Charities are set up at Stitch, not from here. Enter the charity's Stitch merchant id once Stitch has made it.");
  },

  async listPayouts() {
    // Stitch pays each charity out the next day and documents no report of those payouts. Until it does, a charity's
    // deposits page has nothing to read from here.
    return [];
  },
};
