import "server-only";
import { createHmac } from "node:crypto";
import { sameSecret } from "@/lib/secret-compare";
import { gatewayTimeoutOverride } from "./timeout";
import { GatewayError, type CheckoutRequest, type PaymentGateway, type VerifiedTransaction, type WebhookEvent } from "./types";

/**
 * Stitch adapter (decided 18/11/2026: Givezy moves from Paystack to Stitch).
 *
 * NOT YET RUN AGAINST STITCH'S TEST SYSTEM: Stitch issues test access with Givezy's own onboarding. Written to
 * Stitch's published docs (docs.stitch.money, read 17/11/2026); points to check in the test system are marked VERIFY.
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
 * NOT BUILT YET (waiting for test access, because the docs leave points open): saving a card and charging it later
 * (monthly gifts and saved cards: where the split goes on a consent request, which reference the first charge
 * carries, the card id, switching off the extra 3DS step), refunds and disputes arriving as events, a charity's
 * deposits (Stitch pays charities out the next day; there is no documented report), registering a charity from our
 * side (Stitch sets charities up; the merchant API is documented only for in-person payments).
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

async function graphql<T>(what: string, scopes: string[], query: string, variables: Record<string, unknown>): Promise<T> {
  const token = await clientToken(scopes);
  let res: Response;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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

const CREATE_PAYMENT = `
mutation CreatePaymentRequest($amount: MoneyInput!, $externalReference: String!, $payerReference: String!, $beneficiaryReference: String!, $expireAt: Date, $splitSettlements: [SplitSettlementInput!], $paymentMethods: PaymentMethodsInput, $payerInformation: PayerInformationInput) {
  clientPaymentInitiationRequestCreate(input: {
    amount: $amount, externalReference: $externalReference, payerReference: $payerReference,
    beneficiaryReference: $beneficiaryReference, expireAt: $expireAt, splitSettlements: $splitSettlements,
    paymentMethods: $paymentMethods, payerInformation: $payerInformation
  }) { paymentInitiationRequest { id url } }
}`;

/**
 * Look up a payment request by our own reference. `amount` is Stitch's `Money` scalar: it is asked for as a whole and
 * comes back as `{ quantity, currency }` (selecting sub-fields on it is refused before the query runs; fixed 26/11/2026,
 * see docs/stitch-docs-review.md). VERIFY in the test system: the docs list the filter (an
 * `externalReference` string filter) but show no worked example for payment requests, so this is the documented
 * filter in the documented connection shape.
 */
const FIND_PAYMENT = `
query FindPayment($ref: String!) {
  client {
    paymentInitiationRequests(filter: { externalReference: { eq: $ref } }) {
      edges { node {
        id externalReference
        state {
          __typename
          ... on PaymentInitiationRequestCompleted { date amount payer { ... on PaymentInitiationCardPayer { network last4 } } }
          ... on PaymentInitiationRequestCancelled { date reason }
          ... on PaymentInitiationRequestExpired { date }
        }
      } }
    }
  }
}`;

type PaymentNode = {
  id?: string;
  externalReference?: string | null;
  state?: { __typename?: string; date?: string; amount?: Money; payer?: { network?: string | null; last4?: string | null } | null } | null;
};

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

/** The `transaction` event kinds that are payments (Stitch's docs, webhooks/types). Everything else, refunds included, is not. */
const PAYMENT_TRANSACTION_KINDS = new Set(["CARD", "APPLE_PAY", "GOOGLE_PAY", "SAMSUNG_PAY"]);

/** Stitch's webhook signature (Svix): HMAC-SHA256 of "id.timestamp.body" with the secret's bytes, base64, "v1,<sig>". */
export function webhookSignature(secret: string, id: string, timestamp: string, rawBody: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
}

export const stitchGateway: PaymentGateway = {
  name: "stitch",
  /** Off until STITCH_SPLITS=yes, set once splitting is switched on by Stitch and confirmed in the test system. */
  get splitsPayments() {
    return process.env.STITCH_SPLITS === "yes";
  },
  /** Not built yet (see the note at the top): the website and the app say so before anything is recorded. */
  supportsSavedCards: false,

  async createCheckout(req: CheckoutRequest) {
    if (req.saveCard) {
      // Saving a card on Stitch is a different flow (a consent request), not built yet: see the note at the top.
      throw new GatewayError("Saving a card is not set up on this payment provider yet, so nothing was started.");
    }
    if (!stitchGateway.splitsPayments) throw new GatewayError("Stitch takes payments only as a split to a charity's account, and splitting is not switched on, so nothing was started.");
    if (!req.charityAccountRef) throw new GatewayError("This charity has no Stitch account, so the payment was not started (it would not reach the charity).");
    // Stitch settles each side net of its own fee: each side pays it on its own share.
    if (req.feeBearer !== "each") throw new GatewayError("Stitch takes each side's charge on its own share, so a split payment can only start when the gateway charge is paid by each (the platform setting).");
    if (!Number.isSafeInteger(req.lines.charityCents) || req.lines.charityCents <= 0) throw new GatewayError("The charity's share must be a whole number of cents.");
    if (!Number.isSafeInteger(req.lines.contributionCents) || req.lines.contributionCents < 0) throw new GatewayError("The contribution must be a whole number of cents.");
    // The two lines must make up the whole payment: anything left over would sit with Givezy.
    if (req.lines.charityCents + req.lines.contributionCents !== req.totalCents) throw new GatewayError("The charity's line and the contribution do not add up to the total, so the payment was not started.");

    const data = await graphql<{ clientPaymentInitiationRequestCreate: { paymentInitiationRequest: { id: string; url: string } } }>(
      "payment request",
      ["client_paymentrequest"],
      CREATE_PAYMENT,
      {
        amount: { quantity: centsToQuantity(req.totalCents), currency: "ZAR" },
        externalReference: req.reference,
        // Shown on the donor's statement and Stitch's records: at most 12 and 20 characters.
        payerReference: "Givezy",
        beneficiaryReference: `Gift ${req.reference.replace(/-/g, "").slice(0, 8)}`,
        expireAt: new Date(Date.now() + PAYMENT_PAGE_MINUTES * 60_000).toISOString(),
        // Single destination, ZAR only. The destination goes inside the split, never as a top-level merchant.
        splitSettlements: [{ merchantId: req.charityAccountRef, amount: { quantity: centsToQuantity(req.lines.charityCents), currency: "ZAR" } }],
        // Cards and the phone wallets on Stitch's page. Pay by Bank is switched off (it needs a bank beneficiary).
        paymentMethods: { card: { enabled: true }, applePay: { enabled: true }, googlePay: { enabled: true }, eft: { enabled: false } },
        payerInformation: { email: req.email },
      },
    );
    const made = data.clientPaymentInitiationRequestCreate?.paymentInitiationRequest;
    if (!made?.url) throw new GatewayError("Stitch gave no payment page, so nothing was started.");
    return { redirectUrl: hostedUrl(made.url, req.returnUrl) };
  },

  async chargeAuthorization() {
    // Charging a saved card later: not built yet (see the note at the top).
    throw new GatewayError("Charging a saved card is not set up on this payment provider yet, so nothing was charged.", { beforeSend: true });
  },

  async verifyTransaction(reference): Promise<VerifiedTransaction> {
    const data = await graphql<{ client?: { paymentInitiationRequests?: { edges?: { node?: PaymentNode }[] } } }>(
      "payment lookup",
      ["client_paymentrequest"],
      FIND_PAYMENT,
      { ref: reference },
    );
    const nodes = (data.client?.paymentInitiationRequests?.edges ?? []).map((e) => e.node).filter((n): n is PaymentNode => Boolean(n));
    // Stitch has no payment request under this reference: it never received it.
    if (nodes.length === 0) throw new GatewayError("Stitch has no record of this payment.", { notFound: true });
    // The answer must be about the payment we asked about (the filter is an equality, but never assume).
    const mine = nodes.filter((n) => n.externalReference === reference);
    if (mine.length !== 1) throw new GatewayError(mine.length === 0 ? "Stitch answered about a different payment." : "Stitch holds more than one payment under this reference.");
    const node = mine[0];
    const state = node.state?.__typename ?? "";
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
      };
    }
    // A cancelled request, or one that ran out of time, is not a declined card: pending, and "abandoned", so only the
    // daily check closes it (and it is never counted against the donor). A donor who just closes the page leaves the
    // request pending (Stitch's docs: it is cancelled only if we cancel it or Stitch switches on cancel-on-close),
    // which is why every request has an expiry. A card turned down on Stitch's page also leaves it open for another try.
    const left = state === "PaymentInitiationRequestCancelled" || state === "PaymentInitiationRequestExpired";
    return { reference, status: "pending", amountCents: 0, currency: "ZAR", gatewayTransactionId: String(node.id ?? ""), paidAt: null, authorization: null, channel: null, abandoned: left };
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
    // payment's own, shared by a first "pending" event and the later "completed" one, which would then be dropped as a repeat.
    const eventId = `${type}:${id}`;
    let reference: string | null = null;
    let kind: WebhookEvent["type"] = "other";
    if (type === "payment") {
      // data.client.paymentInitiationRequests.node: a completed payment request is the only thing that counts. A
      // cancelled or expired one is left to the daily check (the payment check would only say "pending" again).
      reference = typeof paymentNode?.externalReference === "string" ? paymentNode.externalReference : null;
      if (paymentNode?.state?.__typename === "PaymentInitiationRequestCompleted") kind = "payment_succeeded";
    } else if (type === "transaction") {
      // A successful card or wallet payment that carries our reference. Refunds come on this same event with
      // `status: "SUCCESS"` (`data.type` "CARD_REFUND" and the like), so only the payment kinds count, and a
      // transaction that doesn't say its kind is not trusted. Refunds stay "other" (left for a person) until they
      // are built and checked in Stitch's test system. A failed payment is left alone: on Stitch's page a donor may
      // try another card, so a failure is not the end of the payment. VERIFY in the test system.
      const d = body.data as { type?: string; status?: string; externalReference?: string | null } | undefined;
      reference = typeof d?.externalReference === "string" ? d.externalReference : null;
      if (PAYMENT_TRANSACTION_KINDS.has(String(d?.type ?? "")) && d?.status === "SUCCESS" && reference) kind = "payment_succeeded";
    }
    return {
      eventId,
      type: kind,
      reference,
      amountCents: null,
      currency: null,
      detail: null,
      // What we keep of the event: never the whole body (a transaction carries the card's details).
      raw: { type, id, reference },
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
