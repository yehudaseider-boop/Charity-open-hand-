/**
 * The Stitch adapter against a pretend Stitch: what it sends (the split, the amounts as decimal rand, the references),
 * how it reads the answers, and how it checks webhook signatures. Nothing here talks to Stitch; the real behaviour is
 * still to be checked in Stitch's test system (the points marked VERIFY in src/lib/gateway/stitch.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { stitchGateway, centsToQuantity, quantityToCents, clientToken, forgetTokens, webhookSignature } = await import("@/lib/gateway/stitch");
const { GatewayError } = await import("@/lib/gateway/types");

type Call = { url: string; body: string; headers: Record<string, string> };
let calls: Call[];
/** What the pretend GraphQL endpoint answers for the next call(s). */
let graphqlAnswers: ((query: string, variables: Record<string, unknown>) => { status?: number; json: unknown })[];
let tokenAnswer: { status: number; json: unknown };

const SECRET = "whsec_" + Buffer.from("a-long-random-signing-secret-for-tests").toString("base64");

beforeEach(() => {
  process.env.STITCH_CLIENT_ID = "client-id";
  process.env.STITCH_CLIENT_SECRET = "client-secret";
  process.env.STITCH_WEBHOOK_SECRET = SECRET;
  delete process.env.STITCH_SPLITS;
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
      const a = next(parsed.query, parsed.variables);
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

  it("only a completed payment request, or a successful transaction carrying our reference, counts as paid", async () => {
    const cancelled = { ...completed, id: "p2", data: { client: { paymentInitiationRequests: { node: { externalReference: base.reference, state: { __typename: "PaymentInitiationRequestCancelled" } } } } } };
    expect(await send(cancelled)).toMatchObject({ type: "other", reference: base.reference });
    expect(await send({ type: "transaction", id: "transaction:status:success:1", data: { status: "SUCCESS", externalReference: base.reference, card: { last4: "1111" } } })).toMatchObject({ type: "payment_succeeded", reference: base.reference });
    expect(await send({ type: "transaction", id: "t2", data: { status: "SUCCESS", externalReference: null } })).toMatchObject({ type: "other", reference: null });
    expect(await send({ type: "transaction", id: "t3", data: { status: "FAILURE", externalReference: base.reference } })).toMatchObject({ type: "other" });
    // Refunds and anything else are left for a person until they are checked in Stitch's test system.
    expect(await send({ type: "refund", id: "r1", data: {} })).toMatchObject({ type: "other" });
  });

  it("the card's details are never kept from a transaction event", async () => {
    const e = await send({ type: "transaction", id: "t4", data: { status: "SUCCESS", externalReference: base.reference, card: { id: "card-secret", last4: "4242" }, authorizationCode: "A1B2C3" } });
    expect(JSON.stringify(e!.raw)).not.toMatch(/card-secret|4242|A1B2C3/);
  });
});
