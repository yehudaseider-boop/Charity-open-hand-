/**
 * The Stitch adapter against a pretend Stitch: what it sends (the split, the amounts as decimal rand, the references),
 * how it reads the answers, and how it checks webhook signatures. Nothing here talks to Stitch; the real behaviour is
 * still to be checked in Stitch's test system (the points marked VERIFY in src/lib/gateway/stitch.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { stitchGateway, centsToQuantity, quantityToCents, clientToken, forgetTokens, webhookSignature, payerIdFor } = await import("@/lib/gateway/stitch");
const { GatewayError } = await import("@/lib/gateway/types");

type Call = { url: string; body: string; headers: Record<string, string> };
let calls: Call[];
/** What the pretend GraphQL endpoint answers for the next call(s). */
let graphqlAnswers: ((query: string, variables: Record<string, unknown>) => { status?: number; json: unknown })[];
let tokenAnswer: { status: number; json: unknown };

const SECRET = "whsec_" + Buffer.from("a-long-random-signing-secret-for-tests").toString("base64");

/**
 * What real Stitch turns down before any answer is made, from its API reference (docs.stitch.money, read 26/11/2026;
 * see docs/stitch-docs-review.md). The pretend Stitch below refuses the same, so a query that only works here fails here.
 * - `Money` (amount, feeAmount, netAmount, originalAmount) is a scalar: selecting sub-fields on it is a validation error.
 * - The payment request input takes only the fields of `ClientPaymentInitiationRequestCreateInput`.
 * - A top-level `merchantId` or `externalMerchantId` cannot be combined with `splitSettlements`.
 * - `payerReference` is at most 12 characters and `beneficiaryReference` at most 20.
 */
const PAYMENT_REQUEST_INPUT = new Set([
  "amount", "merchantId", "externalMerchantId", "beneficiary", "payerReference", "payerInformation", "beneficiaryReference",
  "externalReference", "expireAt", "merchant", "iframeAllowlist", "restrictPayerBank", "merchantDetails", "paymentMethods",
  "metadata", "splitSettlements",
]);
function stitchRefuses(query: string, variables: Record<string, unknown>): { status: number; json: unknown } | null {
  const money = /\b(amount|feeAmount|netAmount|originalAmount)\s*\{/.exec(query);
  if (money) {
    return { status: 400, json: { errors: [{ message: `Field "${money[1]}" must not have a selection since type "Money!" has no subfields.`, extensions: { code: "GRAPHQL_VALIDATION_FAILED" } }] } };
  }
  const input = /clientPaymentInitiationRequestCreate\(\s*input:\s*\{([\s\S]*?)\}\s*\)/.exec(query);
  if (input) {
    for (const [, field] of input[1].matchAll(/(\w+)\s*:/g)) {
      if (!PAYMENT_REQUEST_INPUT.has(field)) {
        return { status: 400, json: { errors: [{ message: `Field "${field}" is not defined by type "ClientPaymentInitiationRequestCreateInput".`, extensions: { code: "GRAPHQL_VALIDATION_FAILED" } }] } };
      }
    }
    const bad = (code: string, message: string) => ({ status: 200, json: { errors: [{ message, extensions: { code } }] } });
    if ((variables.merchantId || variables.externalMerchantId) && variables.splitSettlements) return bad("merchant_id_with_split_settlements", "A merchantId cannot be combined with splitSettlements.");
    if (typeof variables.payerReference === "string" && variables.payerReference.length > 12) return bad("BAD_USER_INPUT", "payerReference is longer than 12 characters.");
    if (typeof variables.beneficiaryReference === "string" && variables.beneficiaryReference.length > 20) return bad("BAD_USER_INPUT", "beneficiaryReference is longer than 20 characters.");
    const payer = unknownField(variables.payerInformation, PAYER_INFORMATION_INPUT, "PayerInformationInput");
    if (payer) return payer;
  }
  // Inputs sent whole as `$input` (consents and saved-card charges): only the fields their input types have.
  const whole = variables.input as Record<string, unknown> | undefined;
  if (/paymentConsentRequestCreate\(/.test(query) && whole) {
    const wrong = unknownField(whole, CONSENT_INPUT, "CreatePaymentConsentRequestInput") ?? unknownField(whole.payerInformation, PAYER_INFORMATION_INPUT, "PayerInformationInput");
    if (wrong) return wrong;
    const card = (whole.paymentMethods as { card?: { initialCharge?: { amount?: unknown; merchantId?: unknown } } } | undefined)?.card;
    const bad = (code: string, message: string) => ({ status: 200, json: { errors: [{ message, extensions: { code } }] } });
    if (whole.splitSettlements && !card?.initialCharge?.amount) return bad("BAD_USER_INPUT", "splitSettlements need an initialCharge amount.");
    if (whole.splitSettlements && card?.initialCharge?.merchantId) return bad("merchant_id_with_split_settlements", "initialCharge.merchantId cannot be combined with splitSettlements.");
  }
  if (/initiateTransaction\(/.test(query) && whole) {
    const wrong = unknownField(whole, TRANSACTION_INPUT, "TransactionInitiateInput") ?? unknownField(whole.payerInformation, PAYER_INFORMATION_INPUT, "PayerInformationInput");
    if (wrong) return wrong;
    const bad = (code: string, message: string) => ({ status: 200, json: { errors: [{ message, extensions: { code } }] } });
    if ((whole.merchantId || whole.externalMerchantId) && whole.splitSettlements) return bad("merchant_id_with_split_settlements", "A merchantId cannot be combined with splitSettlements.");
    // A nonce identifies one transaction: Stitch refuses a second one with it.
    if (typeof whole.nonce === "string") {
      if (usedNonces.has(whole.nonce)) return bad("BAD_USER_INPUT", "transactionExistsError: a transaction with this nonce already exists.");
      usedNonces.add(whole.nonce);
    }
  }
  return null;
}
const PAYER_INFORMATION_INPUT = new Set(["payerId", "identifyingDocument", "businessRegistration", "mobileNumber", "email", "fullName", "bankAccountNumber", "accountCreatedDate"]);
const CONSENT_INPUT = new Set(["nonce", "externalReference", "payerInformation", "paymentMethods", "metadata", "expireAt", "splitSettlements"]);
const TRANSACTION_INPUT = new Set([
  "paymentRequestId", "amount", "nonce", "externalReference", "payerInformation", "deviceInformation", "merchantId", "externalMerchantId",
  "beneficiaryAccountId", "metadata", "splitSettlements", "token", "paymentMethods",
]);
function unknownField(value: unknown, allowed: Set<string>, type: string): { status: number; json: unknown } | null {
  if (!value || typeof value !== "object") return null;
  const field = Object.keys(value).find((k) => !allowed.has(k));
  return field ? { status: 200, json: { errors: [{ message: `Field "${field}" is not defined by type "${type}".`, extensions: { code: "BAD_USER_INPUT" } }] } } : null;
}
let usedNonces: Set<string>;

beforeEach(() => {
  process.env.STITCH_CLIENT_ID = "client-id";
  process.env.STITCH_CLIENT_SECRET = "client-secret";
  process.env.STITCH_WEBHOOK_SECRET = SECRET;
  delete process.env.STITCH_SPLITS;
  delete process.env.STITCH_SAVED_CARDS;
  usedNonces = new Set();
  forgetTokens();
  calls = [];
  graphqlAnswers = [];
  tokenAnswer = { status: 200, json: { access_token: "tok-1", expires_in: 3600 } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
      const body = typeof init?.body === "string" ? init.body : init?.body ? String(init.body) : "";
      calls.push({ url, body, headers });
      if (url === "https://secure.stitch.money/connect/token") return new Response(JSON.stringify(tokenAnswer.json), { status: tokenAnswer.status });
      const next = graphqlAnswers.shift();
      if (!next) throw new Error("unexpected call");
      const parsed = JSON.parse(body) as { query: string; variables: Record<string, unknown> };
      const a = stitchRefuses(parsed.query, parsed.variables) ?? next(parsed.query, parsed.variables);
      return new Response(JSON.stringify(a.json), { status: a.status ?? 200 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const base = {
  reference: "11111111-1111-1111-1111-111111111111",
  totalCents: 20_345,
  lines: { charityCents: 18_000, contributionCents: 2_345 },
  charityAccountRef: "bWVyY2hhbnQvY2hhcml0eQ==",
  feeBearer: "each" as const,
  email: "donor@example.co.za",
  returnUrl: "https://example.co.za/donate/return?reference=1&t=x",
  description: "Donation to Meals Fund",
};
const made = (url = "https://secure.stitch.money/pay/abc") => ({ json: { data: { clientPaymentInitiationRequestCreate: { paymentInitiationRequest: { id: "req-1", url } } } } });

describe("the pretend Stitch refuses what real Stitch refuses", () => {
  it("sub-fields on a Money amount, unknown input fields, a merchant beside a split, long references", () => {
    expect(stitchRefuses("query { a { amount { quantity } } }", {})?.status).toBe(400);
    expect(stitchRefuses("query { a { amount feeAmount } }", {})).toBeNull();
    expect(stitchRefuses("mutation { clientPaymentInitiationRequestCreate(input: { amount: $a, colour: $c }) { id } }", {})?.status).toBe(400);
    const ok = "mutation { clientPaymentInitiationRequestCreate(input: { amount: $a, splitSettlements: $s }) { id } }";
    expect(stitchRefuses(ok, { splitSettlements: [{}] })).toBeNull();
    expect(stitchRefuses(ok, { splitSettlements: [{}], merchantId: "m" })).not.toBeNull();
    expect(stitchRefuses(ok, { payerReference: "a".repeat(13) })).not.toBeNull();
    expect(stitchRefuses(ok, { beneficiaryReference: "a".repeat(21) })).not.toBeNull();
  });
});

describe("money", () => {
  it("writes whole cents as decimal rand without a float", () => {
    expect(centsToQuantity(1)).toBe("0.01");
    expect(centsToQuantity(100)).toBe("1.00");
    expect(centsToQuantity(20_345)).toBe("203.45");
    expect(centsToQuantity(100_000_000)).toBe("1000000.00");
    for (const bad of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) expect(() => centsToQuantity(bad)).toThrow(GatewayError);
  });

  it("reads Stitch's amounts back to whole cents, and nothing else", () => {
    expect(quantityToCents("1")).toBe(100);
    expect(quantityToCents("203.45")).toBe(20_345);
    expect(quantityToCents("0.5")).toBe(50);
    expect(quantityToCents(12)).toBe(1_200);
    for (const bad of ["", "abc", "-1", "1.234", "1e3", "1,50", null, undefined, {}, Number.NaN]) expect(quantityToCents(bad)).toBeNull();
  });
});

describe("splitting is a switch", () => {
  it("is off unless STITCH_SPLITS is exactly 'yes'", () => {
    expect(stitchGateway.splitsPayments).toBe(false);
    process.env.STITCH_SPLITS = "true";
    expect(stitchGateway.splitsPayments).toBe(false);
    process.env.STITCH_SPLITS = "yes";
    expect(stitchGateway.splitsPayments).toBe(true);
  });
});

describe("signing in", () => {
  it("asks for the scopes with the client credentials, and keeps the token until just before it expires", async () => {
    const t0 = 1_800_000_000_000;
    expect(await clientToken(["client_paymentrequest"], t0)).toBe("tok-1");
    const form = new URLSearchParams(calls[0].body);
    expect(Object.fromEntries(form)).toEqual({
      grant_type: "client_credentials",
      client_id: "client-id",
      client_secret: "client-secret",
      scope: "client_paymentrequest",
      audience: "https://secure.stitch.money/connect/token",
    });
    expect(await clientToken(["client_paymentrequest"], t0 + 3_000_000)).toBe("tok-1");
    expect(calls).toHaveLength(1);
    tokenAnswer = { status: 200, json: { access_token: "tok-2", expires_in: 3600 } };
    expect(await clientToken(["client_paymentrequest"], t0 + 3_545_000)).toBe("tok-2");
    expect(calls).toHaveLength(2);
  });

  it("a refused sign-in is a set-up problem: not a refusal of the donor's request", async () => {
    tokenAnswer = { status: 400, json: { error: "invalid_scope" } };
    await expect(clientToken(["client_paymentrequest"])).rejects.toMatchObject({ refused: false, notFound: false });
  });
});

describe("starting a gift", () => {
  beforeEach(() => {
    process.env.STITCH_SPLITS = "yes";
  });

  it("asks for one payment with our reference, decimal rand, the charity's line as the split, and the donor's return address", async () => {
    graphqlAnswers.push(() => made());
    const r = await stitchGateway.createCheckout(base);
    const gql = calls.find((c) => c.url === "https://api.stitch.money/graphql")!;
    expect(gql.headers.Authorization).toBe("Bearer tok-1");
    const { query, variables } = JSON.parse(gql.body);
    expect(query).toContain("clientPaymentInitiationRequestCreate");
    expect(variables.amount).toEqual({ quantity: "203.45", currency: "ZAR" });
    expect(variables.externalReference).toBe(base.reference);
    // Single destination inside the split, charity's line only; the rest stays with Givezy. No top-level merchant.
    expect(variables.splitSettlements).toEqual([{ merchantId: "bWVyY2hhbnQvY2hhcml0eQ==", amount: { quantity: "180.00", currency: "ZAR" } }]);
    expect(variables.merchantId).toBeUndefined();
    expect(variables.paymentMethods).toEqual({ card: { enabled: true }, applePay: { enabled: true }, googlePay: { enabled: true }, eft: { enabled: false } });
    expect(variables.payerReference.length).toBeLessThanOrEqual(12);
    expect(variables.beneficiaryReference.length).toBeLessThanOrEqual(20);
    const url = new URL(r.redirectUrl);
    expect(url.origin + url.pathname).toBe("https://secure.stitch.money/pay/abc");
    expect(url.searchParams.get("redirect_uri")).toBe(base.returnUrl);
    expect(url.searchParams.get("failure_redirect_uri")).toBe(base.returnUrl);
    expect(calls[0].body).toContain("scope=client_paymentrequest");
  });

  it("sets an expiry on the payment request, as Stitch recommends, so an unpaid page ends as 'expired'", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-26T10:00:00.000Z"), toFake: ["Date"] });
    graphqlAnswers.push(() => made());
    await stitchGateway.createCheckout(base);
    const gql = calls.find((c) => c.url === "https://api.stitch.money/graphql")!;
    const { query, variables } = JSON.parse(gql.body);
    expect(query).toContain("expireAt: $expireAt");
    expect(variables.expireAt).toBe("2026-11-26T12:00:00.000Z");
  });

  it("refuses to start, and sends nothing, when the money could not reach the charity or the sums don't add up", async () => {
    const refusals: Record<string, unknown>[] = [
      { charityAccountRef: null },
      { feeBearer: "charity" },
      { feeBearer: "givezy" },
      { feeBearer: null },
      { lines: { charityCents: 18_000, contributionCents: 2_000 } },
      { lines: { charityCents: 20_345, contributionCents: 0 }, totalCents: 20_346 },
      { lines: { charityCents: 0, contributionCents: 20_345 } },
      { lines: { charityCents: 180.5, contributionCents: 2_164.5 } },
      { saveCard: true },
    ];
    const why = [/no Stitch account/, /on its own share/, /on its own share/, /on its own share/, /do not add up/, /do not add up/, /whole number of cents/, /whole number of cents/, /not set up on this payment provider/];
    for (const [i, change] of refusals.entries()) {
      await expect(stitchGateway.createCheckout({ ...base, ...change } as never)).rejects.toThrow(why[i]);
    }
    expect(calls).toHaveLength(0);
  });

  it("is refused while splitting is off", async () => {
    delete process.env.STITCH_SPLITS;
    await expect(stitchGateway.createCheckout(base)).rejects.toBeInstanceOf(GatewayError);
    expect(calls).toHaveLength(0);
  });

  it("will not send the donor to an address that isn't secure or can't be read", async () => {
    for (const url of ["http://secure.stitch.money/pay/abc", "not a url", ""]) {
      graphqlAnswers.push(() => made(url));
      await expect(stitchGateway.createCheckout(base)).rejects.toBeInstanceOf(GatewayError);
    }
  });

  it("a request Stitch turns down is a refusal, but our own sign-in or scope problem is not", async () => {
    graphqlAnswers.push(() => ({ json: { errors: [{ message: "Split settlements are not allowed for this amount" }] } }));
    await expect(stitchGateway.createCheckout(base)).rejects.toMatchObject({ refused: true, declined: false });
    graphqlAnswers.push(() => ({ json: { errors: [{ message: "Unauthorized: the token has no payment request scope" }] } }));
    await expect(stitchGateway.createCheckout(base)).rejects.toMatchObject({ refused: false });
  });

  it("our own mistakes in the query or variables are never a refusal of the donor's request", async () => {
    for (const error of [
      { message: 'Cannot query field "foo" on type "Query".' },
      { message: "Variable \"$amount\" of type MoneyInput! was provided invalid value", extensions: { code: "BAD_VARIABLE" } },
      { message: "Something", extensions: { code: "GRAPHQL_VALIDATION_FAILED" } },
      { message: "Boom", extensions: { code: "INTERNAL_SERVER_ERROR" } },
    ]) {
      graphqlAnswers.push(() => ({ json: { errors: [error] } }));
      await expect(stitchGateway.createCheckout(base)).rejects.toMatchObject({ refused: false });
    }
  });

  it("a 401 makes it sign in again for the next request", async () => {
    graphqlAnswers.push(() => ({ status: 401, json: {} }));
    await expect(stitchGateway.createCheckout(base)).rejects.toBeInstanceOf(GatewayError);
    graphqlAnswers.push(() => made());
    await stitchGateway.createCheckout(base);
    expect(calls.filter((c) => c.url === "https://secure.stitch.money/connect/token")).toHaveLength(2);
  });

  it("an outage or a lost connection is never a refusal", async () => {
    graphqlAnswers.push(() => ({ status: 503, json: {} }));
    await expect(stitchGateway.createCheckout(base)).rejects.toMatchObject({ refused: false, notFound: false });
    graphqlAnswers.push(() => ({ status: 401, json: {} }));
    await expect(stitchGateway.createCheckout(base)).rejects.toMatchObject({ refused: false });
    // The sign-in works, then the request itself never gets an answer.
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const normal = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "https://api.stitch.money/graphql") throw new Error("socket hang up");
      return normal(url, init);
    });
    await expect(stitchGateway.createCheckout(base)).rejects.toMatchObject({ unreachable: true, refused: false });
    fetchMock.mockImplementation(normal);
  });
});

describe("what is not built yet says so, and charges nothing", () => {
  it("charging a saved card, registering a charity, and payouts", async () => {
    await expect(stitchGateway.chargeAuthorization({} as never)).rejects.toBeInstanceOf(GatewayError);
    await expect(stitchGateway.createCharityAccount({} as never)).rejects.toThrow(/set up at Stitch/);
    expect(await stitchGateway.listPayouts({ charityId: "c", charityAccountRef: "m", since: "2026-11-01" })).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("looking a payment up by our reference", () => {
  const node = (state: Record<string, unknown>, ref = base.reference) => ({ json: { data: { client: { paymentInitiationRequests: { edges: [{ node: { id: "req-1", externalReference: ref, state } }] } } } } });

  it("bug 1: asks for the amount as a whole (Money is a scalar), so Stitch accepts the lookup", async () => {
    graphqlAnswers.push((q) => {
      expect(q).not.toMatch(/\bamount\s*\{/);
      return node({ __typename: "PaymentInitiationRequestCompleted", date: "2026-11-18T08:00:00Z", amount: { quantity: "203.45", currency: "ZAR" } });
    });
    expect(await stitchGateway.verifyTransaction(base.reference)).toMatchObject({ status: "success", amountCents: 20_345, currency: "ZAR" });
  });

  it("a completed payment request is paid, with its amount in cents", async () => {
    graphqlAnswers.push((q, v) => {
      expect(q).toContain("externalReference: { eq: $ref }");
      expect(v).toEqual({ ref: base.reference });
      return node({ __typename: "PaymentInitiationRequestCompleted", date: "2026-11-18T08:00:00Z", amount: { quantity: "203.45", currency: "ZAR" }, payer: { network: "Visa", last4: "1111" } });
    });
    expect(await stitchGateway.verifyTransaction(base.reference)).toMatchObject({
      reference: base.reference,
      status: "success",
      amountCents: 20_345,
      currency: "ZAR",
      gatewayTransactionId: "req-1",
      paidAt: "2026-11-18T08:00:00Z",
      authorization: null,
    });
  });

  it("still open, closed by the donor or run out are never paid, and never a declined card", async () => {
    graphqlAnswers.push(() => node({ __typename: "PaymentInitiationRequestPending" }));
    expect(await stitchGateway.verifyTransaction(base.reference)).toMatchObject({ status: "pending", abandoned: false });
    for (const state of ["PaymentInitiationRequestCancelled", "PaymentInitiationRequestExpired"]) {
      graphqlAnswers.push(() => node({ __typename: state }));
      expect(await stitchGateway.verifyTransaction(base.reference)).toMatchObject({ status: "pending", abandoned: true });
    }
  });

  it("no payment under that reference means Stitch never received it", async () => {
    graphqlAnswers.push(() => ({ json: { data: { client: { paymentInitiationRequests: { edges: [] } } } } }));
    await expect(stitchGateway.verifyTransaction(base.reference)).rejects.toMatchObject({ notFound: true });
  });

  it("a payment in another currency comes back as that currency (the payment check refuses it), and a missing amount is an error", async () => {
    graphqlAnswers.push(() => node({ __typename: "PaymentInitiationRequestCompleted", amount: { quantity: "203.45", currency: "USD" } }));
    expect(await stitchGateway.verifyTransaction(base.reference)).toMatchObject({ status: "success", currency: "USD" });
    graphqlAnswers.push(() => node({ __typename: "PaymentInitiationRequestCompleted" }));
    await expect(stitchGateway.verifyTransaction(base.reference)).rejects.toBeInstanceOf(GatewayError);
  });

  it("an answer about another payment, two payments, or an unreadable amount is an error, never 'paid'", async () => {
    graphqlAnswers.push(() => node({ __typename: "PaymentInitiationRequestCompleted", amount: { quantity: "1", currency: "ZAR" } }, "22222222-2222-2222-2222-222222222222"));
    await expect(stitchGateway.verifyTransaction(base.reference)).rejects.toBeInstanceOf(GatewayError);
    graphqlAnswers.push(() => ({
      json: { data: { client: { paymentInitiationRequests: { edges: [1, 2].map((n) => ({ node: { id: `r${n}`, externalReference: base.reference, state: { __typename: "PaymentInitiationRequestPending" } } })) } } } },
    }));
    await expect(stitchGateway.verifyTransaction(base.reference)).rejects.toBeInstanceOf(GatewayError);
    graphqlAnswers.push(() => node({ __typename: "PaymentInitiationRequestCompleted", amount: { quantity: "twelve", currency: "ZAR" } }));
    await expect(stitchGateway.verifyTransaction(base.reference)).rejects.toBeInstanceOf(GatewayError);
  });
});

describe("webhooks", () => {
  const now = () => String(Math.floor(Date.now() / 1000));
  const send = (body: unknown, over: { id?: string; ts?: string; sig?: string | null; secret?: string } = {}) => {
    const raw = JSON.stringify(body);
    const id = over.id ?? "msg_1";
    const ts = over.ts ?? now();
    const headers = new Headers({ "svix-id": id, "svix-timestamp": ts });
    const sig = over.sig === undefined ? `v1,${webhookSignature(over.secret ?? SECRET, id, ts, raw)}` : over.sig;
    if (sig !== null) headers.set("svix-signature", sig);
    return stitchGateway.parseWebhook(raw, headers);
  };
  const completed = { type: "payment", id: "p1", data: { client: { paymentInitiationRequests: { node: { externalReference: base.reference, state: { __typename: "PaymentInitiationRequestCompleted" } } } } } };

  it("accepts a correctly signed completed payment, and keeps only what it needs", async () => {
    const e = await send(completed);
    expect(e).toMatchObject({ type: "payment_succeeded", reference: base.reference, amountCents: null, eventId: "payment:msg_1" });
    expect(JSON.stringify(e!.raw)).not.toContain("PaymentInitiationRequestCompleted");
  });

  it("accepts the signature among several, and refuses a wrong, missing, malformed or other-secret one", async () => {
    const good = webhookSignature(SECRET, "msg_1", now(), JSON.stringify(completed));
    expect(await send(completed, { sig: `v1,AAAA v1,${good}` })).not.toBeNull();
    const ts = now();
    const ok = await send(completed, { ts, sig: `v2,${webhookSignature(SECRET, "msg_1", ts, JSON.stringify(completed))}` });
    expect(ok).toBeNull(); // only v1 signatures count
    for (const sig of ["v1,AAAA", "", "garbage", null]) expect(await send(completed, { sig })).toBeNull();
    expect(await send(completed, { secret: "whsec_" + Buffer.from("another-secret").toString("base64") })).toBeNull();
  });

  it("takes the Standard Webhooks header names as well as Svix's", async () => {
    const raw = JSON.stringify(completed);
    const ts = now();
    const headers = new Headers({ "webhook-id": "msg_9", "webhook-timestamp": ts, "webhook-signature": `v1,${webhookSignature(SECRET, "msg_9", ts, raw)}` });
    expect(await stitchGateway.parseWebhook(raw, headers)).toMatchObject({ type: "payment_succeeded", eventId: "payment:msg_9" });
  });

  it("each message has its own id, the same message keeps it on a retry, so a later 'completed' is never dropped as a repeat of an earlier event", async () => {
    const pending = { type: "payment", id: "same-payment-id", data: { client: { paymentInitiationRequests: { node: { externalReference: base.reference, state: { __typename: "PaymentInitiationRequestPending" } } } } } };
    const done = { ...completed, id: "same-payment-id" };
    const a = await send(pending, { id: "msg_a" });
    const b = await send(done, { id: "msg_b" });
    expect(a!.eventId).not.toBe(b!.eventId);
    expect((await send(done, { id: "msg_b" }))!.eventId).toBe(b!.eventId);
  });

  it("refuses a message that is old (replayed) or from the future, or without its headers", async () => {
    const old = String(Math.floor(Date.now() / 1000) - 600);
    expect(await send(completed, { ts: old })).toBeNull();
    const future = String(Math.floor(Date.now() / 1000) + 600);
    expect(await send(completed, { ts: future })).toBeNull();
    expect(await stitchGateway.parseWebhook(JSON.stringify(completed), new Headers())).toBeNull();
  });

  it("refuses when the body was changed after signing, or isn't JSON", async () => {
    const headers = new Headers({ "svix-id": "m", "svix-timestamp": now() });
    headers.set("svix-signature", `v1,${webhookSignature(SECRET, "m", headers.get("svix-timestamp")!, JSON.stringify(completed))}`);
    expect(await stitchGateway.parseWebhook(JSON.stringify({ ...completed, id: "other" }), headers)).toBeNull();
    const rawBad = "not json";
    const h2 = new Headers({ "svix-id": "m", "svix-timestamp": now() });
    h2.set("svix-signature", `v1,${webhookSignature(SECRET, "m", h2.get("svix-timestamp")!, rawBad)}`);
    expect(await stitchGateway.parseWebhook(rawBad, h2)).toBeNull();
  });

  it("without the signing secret nothing is ever accepted", async () => {
    delete process.env.STITCH_WEBHOOK_SECRET;
    expect(await send(completed)).toBeNull();
  });

  it("bug 2: a payment event shaped like Stitch's own example (no top-level type or id) is still read", async () => {
    const asDocumented = { data: completed.data };
    expect(await send(asDocumented, { id: "msg_doc" })).toMatchObject({ type: "payment_succeeded", reference: base.reference, eventId: "payment:msg_doc" });
    const cancelled = { data: { client: { paymentInitiationRequests: { node: { externalReference: base.reference, state: { __typename: "PaymentInitiationRequestCancelled" } } } } } };
    expect(await send(cancelled)).toMatchObject({ type: "other", reference: base.reference });
    // A body that is neither shape stays "other".
    expect(await send({ data: { something: "else" } })).toMatchObject({ type: "other", reference: null });
  });

  it("bug 3: a successful refund on the transaction event is never read as a payment", async () => {
    for (const refundType of ["CARD_REFUND", "APPLE_PAY_REFUND", "WALLET_REFUND"]) {
      const e = await send({ type: "transaction", id: `transaction:status:success:${refundType}`, data: { type: refundType, status: "SUCCESS", externalReference: base.reference } });
      expect(e!.type).not.toBe("payment_succeeded");
    }
    // A transaction without a stated kind is not trusted as a payment either.
    expect(await send({ type: "transaction", id: "t-untyped", data: { status: "SUCCESS", externalReference: base.reference } })).toMatchObject({ type: "other" });
  });

  it("only a completed payment request, or a successful card or wallet payment carrying our reference, counts as paid", async () => {
    const cancelled = { ...completed, id: "p2", data: { client: { paymentInitiationRequests: { node: { externalReference: base.reference, state: { __typename: "PaymentInitiationRequestCancelled" } } } } } };
    expect(await send(cancelled)).toMatchObject({ type: "other", reference: base.reference });
    for (const kind of ["CARD", "APPLE_PAY", "GOOGLE_PAY", "SAMSUNG_PAY"]) {
      expect(await send({ type: "transaction", id: `transaction:status:success:${kind}`, data: { type: kind, status: "SUCCESS", externalReference: base.reference, card: { last4: "1111" } } })).toMatchObject({ type: "payment_succeeded", reference: base.reference });
    }
    expect(await send({ type: "transaction", id: "t2", data: { type: "CARD", status: "SUCCESS", externalReference: null } })).toMatchObject({ type: "other", reference: null });
    expect(await send({ type: "transaction", id: "t3", data: { type: "CARD", status: "FAILURE", externalReference: base.reference } })).toMatchObject({ type: "other" });
    // Refunds and anything else are left for a person until they are checked in Stitch's test system.
    expect(await send({ type: "refund", id: "r1", data: {} })).toMatchObject({ type: "other" });
  });

  it("the card's details are never kept from a transaction event", async () => {
    const e = await send({ type: "transaction", id: "t4", data: { type: "CARD", status: "SUCCESS", externalReference: base.reference, card: { id: "card-secret", last4: "4242" }, authorizationCode: "A1B2C3" } });
    expect(JSON.stringify(e!.raw)).not.toMatch(/card-secret|4242|A1B2C3/);
  });
});

describe("the donor's id for Stitch's fraud checks (payerId)", () => {
  it("is sent with every payment request, is the same for the same email, and names nobody", async () => {
    process.env.STITCH_SPLITS = "yes";
    graphqlAnswers.push(() => made());
    await stitchGateway.createCheckout(base);
    const { variables } = JSON.parse(calls.find((c) => c.url === "https://api.stitch.money/graphql")!.body);
    expect(variables.payerInformation.payerId).toBe(payerIdFor("donor@example.co.za"));
    expect(variables.payerInformation.email).toBe("donor@example.co.za");
    expect(payerIdFor(" Donor@Example.co.za ")).toBe(payerIdFor("donor@example.co.za"));
    expect(payerIdFor("someone@else.co.za")).not.toBe(payerIdFor("donor@example.co.za"));
    expect(payerIdFor("donor@example.co.za")).not.toMatch(/donor@|example/);
  });

  it("is keyed: without the key nothing is sent", async () => {
    process.env.STITCH_SPLITS = "yes";
    const key = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    try {
      await expect(stitchGateway.createCheckout(base)).rejects.toMatchObject({ beforeSend: true });
      expect(calls).toHaveLength(0);
    } finally {
      process.env.ENCRYPTION_KEY = key;
    }
  });
});

describe("where a payment was split to (reportsSplit)", () => {
  const completedWith = (splits: unknown) => ({
    json: { data: { client: { paymentInitiationRequests: { edges: [{ node: { id: "req-1", externalReference: base.reference, splitSettlements: splits, state: { __typename: "PaymentInitiationRequestCompleted", amount: { quantity: "203.45", currency: "ZAR" } } } }] } } } },
  });

  it("names the charity merchant the payment request was split to, so the payment check can compare it", async () => {
    expect(stitchGateway.reportsSplit).toBe(true);
    graphqlAnswers.push((q) => {
      expect(q).toMatch(/splitSettlements \{ merchantId \}/);
      return completedWith([{ merchantId: base.charityAccountRef }]);
    });
    expect(await stitchGateway.verifyTransaction(base.reference)).toMatchObject({ status: "success", settledTo: [base.charityAccountRef] });
    graphqlAnswers.push(() => completedWith(null));
    expect(await stitchGateway.verifyTransaction(base.reference)).toMatchObject({ status: "success", settledTo: [] });
  });

  it("a request 'completed by hand' at Stitch (no payment exists) is never paid, and is left for the daily check to close", async () => {
    graphqlAnswers.push(() => ({ json: { data: { client: { paymentInitiationRequests: { edges: [{ node: { id: "req-1", externalReference: base.reference, state: { __typename: "PaymentInitiationRequestManuallyCompleted" } } }] } } } } }));
    expect(await stitchGateway.verifyTransaction(base.reference)).toMatchObject({ status: "pending", abandoned: true });
  });
});

describe("saved cards and monthly gifts", () => {
  const charge = {
    reference: "33333333-3333-3333-3333-333333333333",
    authorizationCode: "Y29uc2VudC8x",
    email: base.email,
    totalCents: 20_345,
    lines: base.lines,
    charityAccountRef: base.charityAccountRef,
    feeBearer: "each" as const,
    description: "Donation to Meals Fund",
    monthly: true,
  };
  const chargeAnswer = (state: Record<string, unknown>) => () => ({ json: { data: { initiateTransaction: { __typename: "CardTransaction", id: "tx-1", state } } } });
  const transactions = (nodes: Record<string, unknown>[]) => ({ json: { data: { client: { transactions: { edges: nodes.map((node) => ({ node })) } } } } });
  const noPaymentRequest = () => ({ json: { data: { client: { paymentInitiationRequests: { edges: [] } } } } });

  beforeEach(() => {
    process.env.STITCH_SPLITS = "yes";
  });

  it("are off unless STITCH_SAVED_CARDS is exactly 'yes', and say so before anything is sent", async () => {
    expect(stitchGateway.supportsSavedCards).toBe(false);
    await expect(stitchGateway.chargeAuthorization(charge)).rejects.toMatchObject({ beforeSend: true });
    await expect(stitchGateway.createCheckout({ ...base, saveCard: true })).rejects.toMatchObject({ beforeSend: true });
    process.env.STITCH_SAVED_CARDS = "true";
    expect(stitchGateway.supportsSavedCards).toBe(false);
    process.env.STITCH_SAVED_CARDS = "yes";
    expect(stitchGateway.supportsSavedCards).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("the first gift is a card consent on Stitch's page: card only, the split and our reference on its first charge", async () => {
    process.env.STITCH_SAVED_CARDS = "yes";
    vi.useFakeTimers({ now: new Date("2026-11-26T10:00:00.000Z"), toFake: ["Date"] });
    graphqlAnswers.push((q) => {
      expect(q).toContain("paymentConsentRequestCreate");
      return { json: { data: { paymentConsentRequestCreate: { id: "Y29uc2VudC8x", url: "https://secure.stitch.money/connect/consent/abc" } } } };
    });
    const r = await stitchGateway.createCheckout({ ...base, saveCard: true });
    const gql = calls.find((c) => c.url === "https://api.stitch.money/graphql")!;
    const { input } = JSON.parse(gql.body).variables;
    expect(input.nonce).toBe(base.reference);
    expect(input.externalReference).toBe(base.reference);
    expect(input.expireAt).toBe("2026-11-26T12:00:00.000Z");
    expect(input.splitSettlements).toEqual([{ merchantId: base.charityAccountRef, amount: { quantity: "180.00", currency: "ZAR" } }]);
    expect(input.paymentMethods).toEqual({ card: { enabled: true, initialCharge: { amount: { quantity: "203.45", currency: "ZAR" }, nonce: base.reference, externalReference: base.reference } } });
    expect(input.payerInformation.payerId).toBe(payerIdFor(base.email));
    expect(calls[0].body).toContain("scope=client_recurringpaymentconsentrequest");
    expect(new URL(r.redirectUrl).searchParams.get("redirect_uri")).toBe(base.returnUrl);
  });

  it("each month: charged by our server on the consent, as a merchant-started charge in one series, with the split every time", async () => {
    process.env.STITCH_SAVED_CARDS = "yes";
    graphqlAnswers.push(chargeAnswer({ __typename: "TransactionSuccess", date: "2026-12-01T06:00:00Z" }));
    expect(await stitchGateway.chargeAuthorization(charge)).toEqual({ status: "success" });
    const gql = calls.find((c) => c.url === "https://api.stitch.money/graphql")!;
    const { query, variables } = JSON.parse(gql.body);
    expect(query).toContain("initiateTransaction");
    expect(variables.input).toMatchObject({
      amount: { quantity: "203.45", currency: "ZAR" },
      nonce: charge.reference,
      externalReference: charge.reference,
      token: charge.authorizationCode,
      splitSettlements: [{ merchantId: base.charityAccountRef, amount: { quantity: "180.00", currency: "ZAR" } }],
      paymentMethods: { card: { recurringPayment: { source: "merchant", agreement: { reference: charge.authorizationCode, variability: "variable", scenario: "Subscription" } } } },
    });
    expect(variables.input.merchantId).toBeUndefined();
    expect(gql.headers["Idempotency-Key"]).toBe(`charge-${charge.reference}`);
    expect(calls[0].body).toContain("scope=transaction_initiate");
  });

  it("a once-off gift on a saved card is an unscheduled charge", async () => {
    process.env.STITCH_SAVED_CARDS = "yes";
    graphqlAnswers.push(chargeAnswer({ __typename: "TransactionSuccess" }));
    await stitchGateway.chargeAuthorization({ ...charge, monthly: false });
    const { variables } = JSON.parse(calls.find((c) => c.url === "https://api.stitch.money/graphql")!.body);
    expect(variables.input.paymentMethods.card.recurringPayment.agreement.scenario).toBe("Unscheduled");
  });

  it("the card turned down is a decline; anything else Stitch turns down is not the donor's card; waiting is pending", async () => {
    process.env.STITCH_SAVED_CARDS = "yes";
    graphqlAnswers.push(chargeAnswer({ __typename: "TransactionFailure", reason: "insufficientFunds" }));
    expect(await stitchGateway.chargeAuthorization({ ...charge, reference: "r-1" })).toEqual({ status: "failed" });
    graphqlAnswers.push(chargeAnswer({ __typename: "TransactionFailure", reason: "invalidConsentRequest" }));
    expect(await stitchGateway.chargeAuthorization({ ...charge, reference: "r-2" })).toEqual({ status: "failed" });
    graphqlAnswers.push(chargeAnswer({ __typename: "TransactionFailure", reason: "invalidConfigurationError", reasonDescription: "client set-up" }));
    await expect(stitchGateway.chargeAuthorization({ ...charge, reference: "r-3" })).rejects.toMatchObject({ refused: true, declined: false });
    graphqlAnswers.push(chargeAnswer({ __typename: "TransactionPending", reason: "waitingFor3dSecure" }));
    expect(await stitchGateway.chargeAuthorization({ ...charge, reference: "r-4" })).toEqual({ status: "pending" });
  });

  it("the same charge sent twice is refused by Stitch, never charged twice", async () => {
    process.env.STITCH_SAVED_CARDS = "yes";
    graphqlAnswers.push(chargeAnswer({ __typename: "TransactionSuccess" }));
    await stitchGateway.chargeAuthorization(charge);
    graphqlAnswers.push(chargeAnswer({ __typename: "TransactionSuccess" }));
    await expect(stitchGateway.chargeAuthorization(charge)).rejects.toMatchObject({ refused: true });
  });

  it("refuses to charge, and sends nothing, without a split it can make or a saved card", async () => {
    process.env.STITCH_SAVED_CARDS = "yes";
    for (const change of [{ charityAccountRef: null }, { feeBearer: "charity" as const }, { authorizationCode: "" }, { totalCents: 1 }]) {
      await expect(stitchGateway.chargeAuthorization({ ...charge, ...change })).rejects.toMatchObject({ beforeSend: true });
    }
    expect(calls).toHaveLength(0);
  });

  it("a charge on a saved card is looked up as a transaction by our reference, with the saved card it can charge again", async () => {
    process.env.STITCH_SAVED_CARDS = "yes";
    graphqlAnswers.push(noPaymentRequest);
    graphqlAnswers.push((q, v) => {
      expect(q).toContain("transactions(filter: { externalReference: { eq: $ref } })");
      expect(q).not.toMatch(/\bamount\s*\{/);
      expect(v).toEqual({ ref: base.reference });
      return transactions([
        // A refund under the same reference is never read as the payment.
        { __typename: "CardRefundTransaction", id: "rf-1", externalReference: base.reference, amount: { quantity: "203.45", currency: "ZAR" }, state: { __typename: "TransactionSuccess" } },
        {
          __typename: "CardTransaction",
          id: "tx-1",
          externalReference: base.reference,
          amount: { quantity: "203.45", currency: "ZAR" },
          state: { __typename: "TransactionSuccess", date: "2026-11-26T10:05:00Z" },
          paymentConsentRequest: { id: "Y29uc2VudC8x", status: { __typename: "PaymentConsentGranted" } },
          card: { network: "Visa", last4: "1111", expiryMonth: 3, expiryYear: 29 },
          splitSettlements: [{ merchantId: base.charityAccountRef }],
        },
      ]);
    });
    expect(await stitchGateway.verifyTransaction(base.reference)).toEqual({
      reference: base.reference,
      status: "success",
      amountCents: 20_345,
      currency: "ZAR",
      gatewayTransactionId: "tx-1",
      paidAt: "2026-11-26T10:05:00Z",
      authorization: { code: "Y29uc2VudC8x", reusable: true, last4: "1111", brand: "visa", expires: "03/2029" },
      channel: "card",
      settledTo: [base.charityAccountRef],
    });
  });

  it("a consent that isn't granted can't be charged again; a failed charge is failed; a waiting one is pending", async () => {
    process.env.STITCH_SAVED_CARDS = "yes";
    const node = (state: Record<string, unknown>, consent = "PaymentConsentGranted") => ({
      __typename: "CardTransaction", id: "tx-1", externalReference: base.reference, amount: { quantity: "1.00", currency: "ZAR" }, state,
      paymentConsentRequest: { id: "c1", status: { __typename: consent } }, card: { network: "Mastercard", last4: "4444", expiryMonth: 12, expiryYear: 2030 },
    });
    graphqlAnswers.push(noPaymentRequest, () => transactions([node({ __typename: "TransactionSuccess" }, "PaymentConsentRevoked")]));
    expect((await stitchGateway.verifyTransaction(base.reference)).authorization).toMatchObject({ code: "c1", reusable: false, expires: "12/2030" });
    graphqlAnswers.push(noPaymentRequest, () => transactions([node({ __typename: "TransactionFailure", reason: "insufficientFunds" })]));
    expect(await stitchGateway.verifyTransaction(base.reference)).toMatchObject({ status: "failed" });
    graphqlAnswers.push(noPaymentRequest, () => transactions([node({ __typename: "TransactionPending", reason: "waitingFor3dSecure" })]));
    expect(await stitchGateway.verifyTransaction(base.reference)).toMatchObject({ status: "pending", abandoned: false });
  });

  it("with saved cards off, nothing under the reference means Stitch never received it (no second lookup)", async () => {
    graphqlAnswers.push(noPaymentRequest);
    await expect(stitchGateway.verifyTransaction(base.reference)).rejects.toMatchObject({ notFound: true });
    expect(calls.filter((c) => c.url === "https://api.stitch.money/graphql")).toHaveLength(1);
    process.env.STITCH_SAVED_CARDS = "yes";
    graphqlAnswers.push(noPaymentRequest, () => transactions([]));
    await expect(stitchGateway.verifyTransaction(base.reference)).rejects.toMatchObject({ notFound: true });
  });
});

describe("refunds, disputes and saved-card events", () => {
  const now = () => String(Math.floor(Date.now() / 1000));
  const send = (body: unknown, id = "msg_r") => {
    const raw = JSON.stringify(body);
    const ts = now();
    return stitchGateway.parseWebhook(raw, new Headers({ "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${webhookSignature(SECRET, id, ts, raw)}` }));
  };
  const refundEvent = (status = "SUCCESS", kind = "CARD_REFUND") => ({ type: "transaction", id: "transaction:status:success:r", data: { id: "rf-1", type: kind, status, externalReference: "typed-in-dashboard" } });
  const byId = (node: Record<string, unknown> | null) => () => ({ json: { data: { node } } });

  it("a successful refund is looked up at Stitch: the gift it refunds and Stitch's amount, never the event's words", async () => {
    graphqlAnswers.push((q, v) => {
      expect(q).toContain("node(id: $id)");
      expect(q).not.toMatch(/\bamount\s*\{/);
      expect(v).toEqual({ id: "rf-1" });
      return byId({ __typename: "CardRefundTransaction", id: "rf-1", amount: { quantity: "50.00", currency: "ZAR" }, externalReference: "typed-in-dashboard", state: { __typename: "TransactionSuccess" }, paymentInitiationRequest: { externalReference: base.reference } })();
    });
    const e = await send(refundEvent());
    expect(e).toMatchObject({ type: "refund_processed", reference: base.reference, amountCents: 5_000, currency: "ZAR" });
    expect(calls[0].body).toContain("scope=client_refund");
  });

  it("a wallet refund, or one found through the original charge, works the same way", async () => {
    graphqlAnswers.push(byId({ __typename: "WalletRefundTransaction", id: "rf-1", amount: { quantity: "203.45", currency: "ZAR" }, state: { __typename: "TransactionSuccess" }, paymentInitiationRequest: null, originalTransaction: { externalReference: base.reference, paymentInitiationRequest: null } }));
    expect(await send(refundEvent("SUCCESS", "APPLE_PAY_REFUND"))).toMatchObject({ type: "refund_processed", reference: base.reference, amountCents: 20_345 });
  });

  it("a refund Stitch can't place is still a refund, held for a person; a failed refund, or a transaction that isn't a refund, changes nothing", async () => {
    graphqlAnswers.push(byId(null));
    expect(await send(refundEvent())).toMatchObject({ type: "refund_processed", reference: null, amountCents: null });
    expect(await send(refundEvent("FAILURE"))).toMatchObject({ type: "other" });
    graphqlAnswers.push(byId({ __typename: "CardTransaction", id: "rf-1", amount: { quantity: "1", currency: "ZAR" }, state: { __typename: "TransactionSuccess" } }));
    expect(await send(refundEvent("SUCCESS", "SOMETHING_NEW"))).toMatchObject({ type: "other" });
  });

  it("if Stitch can't be reached for the lookup, the event is not taken (it will be sent again)", async () => {
    graphqlAnswers.push(() => ({ status: 503, json: {} }));
    await expect(send(refundEvent())).rejects.toBeInstanceOf(GatewayError);
  });

  it("a dispute opening and closing reaches the gift through Stitch's record of the disputed payment", async () => {
    const dispute = (type: string, status: string, transactions: unknown[]) => ({ type, createdAt: "2026-11-26T10:00:00Z", data: { disputeId: "dsp_1", caseReference: "STDB100", status, transactions } });
    const paid = byId({ __typename: "CardTransaction", id: "tx-9", amount: { quantity: "203.45", currency: "ZAR" }, externalReference: null, state: { __typename: "TransactionSuccess" }, paymentInitiationRequest: { externalReference: base.reference } });
    graphqlAnswers.push(paid);
    expect(await send(dispute("dispute.created", "pending", [{ id: "tx-9" }]), "msg_d1")).toMatchObject({ type: "dispute_opened", reference: base.reference, eventId: "dispute.created:msg_d1", raw: { disputeId: "dsp_1", caseReference: "STDB100" } });
    graphqlAnswers.push(paid);
    expect(await send(dispute("dispute.won", "won", [{ id: "tx-9" }]))).toMatchObject({ type: "dispute_resolved", reference: base.reference, detail: "won" });
    // A case over several payments, or with no transaction id, is held for a person.
    expect(await send(dispute("dispute.lost", "lost", [{ id: "a" }, { id: "b" }]))).toMatchObject({ type: "dispute_resolved", reference: null, detail: "lost" });
    expect(await send(dispute("dispute.created", "pending", [{ id: null }]))).toMatchObject({ type: "dispute_opened", reference: null });
    // Evidence events change nothing here.
    expect(await send(dispute("dispute.evidence_received", "pending", [{ id: "tx-9" }]))).toMatchObject({ type: "other" });
  });

  it("a saved card's consent event is kept with our reference, and changes nothing by itself", async () => {
    const e = await send({ type: "payment-consent-request", id: "payment-consent-request:status:revoked:1", data: { id: "c1", status: "REVOKED", type: "CARD", externalReference: base.reference, card: { last4: "4242" } } });
    expect(e).toMatchObject({ type: "other", reference: base.reference, raw: { status: "REVOKED" } });
    expect(JSON.stringify(e!.raw)).not.toContain("4242");
  });
});
