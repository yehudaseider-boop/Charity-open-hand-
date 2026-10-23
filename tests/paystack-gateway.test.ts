/**
 * The Paystack adapter against a stubbed network: what it sends (split payments), how it
 * reads Paystack's answers, and how it checks webhook signatures. Nothing here talks to
 * Paystack; the real behaviour still has to be checked in Paystack's test mode.
 */
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { paystackGateway } = await import("@/lib/gateway/paystack");
const { GatewayError } = await import("@/lib/gateway/types");

type Call = { url: string; init?: RequestInit; body: Record<string, unknown> | null };
let calls: Call[];
let answers: Record<string, unknown>;

beforeEach(() => {
  process.env.PAYSTACK_SECRET_KEY = "sk_test_unit";
  delete process.env.PAYSTACK_SPLITS;
  calls = [];
  answers = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace("https://api.paystack.co", "");
      calls.push({ url: path, init, body: init?.body ? JSON.parse(init.body as string) : null });
      const key = Object.keys(answers).find((k) => path.startsWith(k));
      const data = key ? answers[key] : {};
      return new Response(JSON.stringify({ status: true, data }), { status: 200 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const base = {
  reference: "11111111-1111-1111-1111-111111111111",
  totalCents: 20_345,
  lines: { charityCents: 18_000, contributionCents: 2_345 },
  email: "donor@example.co.za",
  returnUrl: "https://example.co.za/donate/return?reference=1&t=x",
  description: "Donation to Meals Fund",
};

describe("splitting is a switch", () => {
  it("is off unless PAYSTACK_SPLITS is exactly 'yes'", () => {
    expect(paystackGateway.splitsPayments).toBe(false);
    process.env.PAYSTACK_SPLITS = "true";
    expect(paystackGateway.splitsPayments).toBe(false);
    process.env.PAYSTACK_SPLITS = "yes";
    expect(paystackGateway.splitsPayments).toBe(true);
  });
});

describe("starting a checkout", () => {
  beforeEach(() => {
    answers["/transaction/initialize"] = { authorization_url: "https://checkout.paystack.com/abc" };
  });

  it("splits: the charity's subaccount gets the donation, our flat share is the contribution, the charity pays Paystack's fee when it bears it", async () => {
    const r = await paystackGateway.createCheckout({ ...base, charityAccountRef: "ACCT_charity1", feeBearer: "charity" });
    expect(r.redirectUrl).toBe("https://checkout.paystack.com/abc");
    expect(calls[0].body).toMatchObject({
      amount: 20_345,
      currency: "ZAR",
      reference: base.reference,
      callback_url: base.returnUrl,
      subaccount: "ACCT_charity1",
      transaction_charge: 2_345,
      bearer: "subaccount",
    });
  });

  it("Givezy bearing the fee means the main account bears it", async () => {
    await paystackGateway.createCheckout({ ...base, charityAccountRef: "ACCT_charity1", feeBearer: "givezy" });
    expect(calls[0].body).toMatchObject({ bearer: "account", subaccount: "ACCT_charity1" });
  });

  it("sends the amount as whole cents and the secret key as a bearer token", async () => {
    await paystackGateway.createCheckout({ ...base, charityAccountRef: "ACCT_charity1", feeBearer: "charity" });
    expect(Number.isInteger(calls[0].body!.amount)).toBe(true);
    expect((calls[0].init!.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_unit");
  });

  it("without a charity account there is no split at all", async () => {
    await paystackGateway.createCheckout({ ...base, charityAccountRef: null, feeBearer: "charity" });
    expect(calls[0].body).not.toHaveProperty("subaccount");
    expect(calls[0].body).not.toHaveProperty("transaction_charge");
    expect(calls[0].body).not.toHaveProperty("bearer");
  });

  it("will not start a split payment while who pays the gateway charge is undecided", async () => {
    await expect(paystackGateway.createCheckout({ ...base, charityAccountRef: "ACCT_charity1", feeBearer: null })).rejects.toBeInstanceOf(GatewayError);
    expect(calls).toHaveLength(0);
  });

  it("keeps the charity and contribution lines in the metadata", async () => {
    await paystackGateway.createCheckout({ ...base, charityAccountRef: "ACCT_charity1", feeBearer: "charity" });
    expect(calls[0].body!.metadata).toMatchObject({ charity_cents: 18_000, contribution_cents: 2_345 });
  });
});

describe("registering a charity's bank account", () => {
  const req = { charityId: "c1", businessName: "Meals Fund NPC", bankName: "Nedbank", accountNumber: "1234567890", branchCode: "198765", accountHolder: "Meals Fund NPC" };

  it("looks up the bank code and creates the subaccount with no default share", async () => {
    answers["/bank"] = [{ name: "FNB", code: "011" }, { name: "Nedbank", code: "016" }];
    answers["/subaccount"] = { subaccount_code: "ACCT_new" };
    expect(await paystackGateway.createCharityAccount(req)).toEqual({ accountRef: "ACCT_new" });
    expect(calls[1].body).toMatchObject({ business_name: "Meals Fund NPC", settlement_bank: "016", account_number: "1234567890", percentage_charge: 0 });
  });

  it("refuses a bank Paystack does not list", async () => {
    answers["/bank"] = [{ name: "FNB", code: "011" }];
    await expect(paystackGateway.createCharityAccount(req)).rejects.toThrow(/no bank matching/);
    expect(calls.some((c) => c.url === "/subaccount")).toBe(false);
  });

  it("refuses an ambiguous bank name instead of guessing", async () => {
    answers["/bank"] = [{ name: "Standard Bank", code: "051" }, { name: "Standard Chartered", code: "052" }];
    await expect(paystackGateway.createCharityAccount({ ...req, bankName: "Standard" })).rejects.toThrow(/More than one/);
  });

  it("an exact name wins over a longer one", async () => {
    answers["/bank"] = [{ name: "Capitec Business Bank", code: "999" }, { name: "Capitec Bank", code: "470010" }];
    answers["/subaccount"] = { subaccount_code: "ACCT_x" };
    await paystackGateway.createCharityAccount({ ...req, bankName: "capitec bank" });
    expect(calls[1].body).toMatchObject({ settlement_bank: "470010" });
  });
});

describe("every bank the application offers connects", () => {
  // Paystack's South African list as read on 23/10/2026 (names and codes).
  const live = [
    ["Absa Bank Limited, South Africa", "632005"], ["Access Bank South Africa", "410506"], ["African Bank Limited", "430000"], ["African Business Bank", "584000"],
    ["Capitec Bank Limited", "470010"], ["Capitec Business", "450105"], ["Discovery Bank Limited", "679000"], ["First National Bank", "250655"],
    ["FirstRand Bank", "201419"], ["GoTyme Bank", "678910"], ["Investec Bank Ltd", "580105"], ["Nedbank", "198765"], ["Standard Bank South Africa", "051001"],
    ["Standard Chartered Bank", "730020"], ["Ubank Ltd", "431010"],
  ].map(([name, code]) => ({ name, code }));
  const expected: Record<string, string> = {
    Absa: "632005", "African Bank": "430000", Capitec: "470010", "Capitec Business": "450105", "Discovery Bank": "679000", FNB: "250655",
    Investec: "580105", Nedbank: "198765", "Standard Bank": "051001", TymeBank: "678910",
  };
  it("maps each to the right Paystack bank code", async () => {
    for (const [bankName, code] of Object.entries(expected)) {
      calls.length = 0;
      answers["/bank"] = live;
      answers["/subaccount"] = { subaccount_code: "ACCT_x" };
      await paystackGateway.createCharityAccount({ charityId: "c1", businessName: "X NPC", bankName, accountNumber: "1234567890", branchCode: code, accountHolder: "X NPC" });
      expect(calls[1].body, bankName).toMatchObject({ settlement_bank: code });
    }
  });
  it("every bank on the application form is covered by the test above, and Other asks for the real bank", async () => {
    const { bankNames } = await import("@/lib/charity/validation");
    expect(bankNames.filter((b) => b !== "Other" && !(b in expected))).toEqual([]);
    answers["/bank"] = live;
    await expect(paystackGateway.createCharityAccount({ charityId: "c1", businessName: "X NPC", bankName: "Other", accountNumber: "1", branchCode: "1", accountHolder: "X" })).rejects.toThrow(/chose "Other"/);
  });
});

describe("reading a payment's status", () => {
  const verify = (status: string, reference = base.reference) => {
    answers["/transaction/verify"] = { id: 42, status, amount: 20_345, currency: "ZAR", reference, paid_at: "2026-10-13T08:00:00.000Z" };
    return paystackGateway.verifyTransaction(base.reference);
  };

  it("success is success, with amount in cents and currency", async () => {
    expect(await verify("success")).toMatchObject({ status: "success", amountCents: 20_345, currency: "ZAR", gatewayTransactionId: "42" });
  });

  it("failed and reversed are failed", async () => {
    expect((await verify("failed")).status).toBe("failed");
    expect((await verify("reversed")).status).toBe("failed");
  });

  it("abandoned (started, not paid yet) and anything else stay pending", async () => {
    for (const s of ["abandoned", "ongoing", "pending", "queued", "something-new"]) expect((await verify(s)).status).toBe("pending");
  });

  it("an answer about a different payment is refused", async () => {
    await expect(verify("success", "22222222-2222-2222-2222-222222222222")).rejects.toThrow(/different payment/);
  });
});

describe("webhook signature", () => {
  const body = JSON.stringify({ event: "charge.success", data: { id: 42, reference: base.reference } });
  const sign = (raw: string) => createHmac("sha512", "sk_test_unit").update(raw).digest("hex");
  const headers = (sig: string | null) => new Headers(sig === null ? {} : { "x-paystack-signature": sig });

  it("accepts the right signature and reads the event", async () => {
    const e = await paystackGateway.parseWebhook(body, headers(sign(body)));
    expect(e).toMatchObject({ type: "payment_succeeded", reference: base.reference, eventId: "charge.success:42" });
  });

  it("keeps no card code or customer details from the event", async () => {
    const full = JSON.stringify({
      event: "charge.success",
      data: { id: 43, reference: base.reference, amount: 18000, currency: "ZAR", status: "success", authorization: { authorization_code: "AUTH_secret" }, customer: { email: "donor@example.co.za" } },
    });
    const e = await paystackGateway.parseWebhook(full, headers(sign(full)));
    const kept = JSON.stringify(e?.raw);
    expect(kept).not.toMatch(/AUTH_secret|authorization|donor@example|customer/);
    expect(e?.raw).toMatchObject({ event: "charge.success", reference: base.reference, data: { id: 43, amount: 18000, currency: "ZAR" } });
  });

  it("maps failed charges and other events", async () => {
    const failed = JSON.stringify({ event: "charge.failed", data: { id: 1, reference: "r" } });
    expect((await paystackGateway.parseWebhook(failed, headers(sign(failed))))?.type).toBe("payment_failed");
    const other = JSON.stringify({ event: "transfer.success", data: { id: 2 } });
    expect((await paystackGateway.parseWebhook(other, headers(sign(other))))?.type).toBe("other");
  });

  it("reads refunds and disputes, naming the original payment", async () => {
    const refund = JSON.stringify({ event: "refund.processed", data: { id: 7, amount: 18000, transaction_reference: base.reference } });
    expect(await paystackGateway.parseWebhook(refund, headers(sign(refund)))).toMatchObject({ type: "refund_processed", reference: base.reference, amountCents: 18000, eventId: "refund.processed:7" });
    const opened = JSON.stringify({ event: "charge.dispute.create", data: { id: 8, transaction: { reference: base.reference } } });
    expect(await paystackGateway.parseWebhook(opened, headers(sign(opened)))).toMatchObject({ type: "dispute_opened", reference: base.reference });
    const resolved = JSON.stringify({ event: "charge.dispute.resolve", data: { id: 9, resolution: "declined", transaction: { reference: base.reference } } });
    expect(await paystackGateway.parseWebhook(resolved, headers(sign(resolved)))).toMatchObject({ type: "dispute_resolved", reference: base.reference, detail: "declined" });
    // A refund whose shape we don't recognise names no payment, so it is held for a person.
    const odd = JSON.stringify({ event: "refund.processed", data: { id: 10, amount: 100 } });
    expect(await paystackGateway.parseWebhook(odd, headers(sign(odd)))).toMatchObject({ type: "refund_processed", reference: null });
  });

  it("rejects a wrong signature, a changed body and a missing header", async () => {
    expect(await paystackGateway.parseWebhook(body, headers("0".repeat(128)))).toBeNull();
    expect(await paystackGateway.parseWebhook(body + " ", headers(sign(body)))).toBeNull();
    expect(await paystackGateway.parseWebhook(body, headers(null))).toBeNull();
  });

  it("a malformed header is a plain 'no', never an error", async () => {
    expect(await paystackGateway.parseWebhook(body, headers("é".repeat(128)))).toBeNull();
    expect(await paystackGateway.parseWebhook(body, headers("zz".repeat(64)))).toBeNull();
    expect(await paystackGateway.parseWebhook(body, headers("abc"))).toBeNull();
  });
});

describe("monthly donations", () => {
  it("a monthly checkout asks for a card payment only, so the card can be charged again", async () => {
    answers["/transaction/initialize"] = { authorization_url: "https://checkout.paystack.com/abc" };
    await paystackGateway.createCheckout({ ...base, charityAccountRef: "ACCT_charity1", feeBearer: "charity", saveCard: true });
    expect(calls[0].body).toMatchObject({ channels: ["card"] });
    calls.length = 0;
    await paystackGateway.createCheckout({ ...base, charityAccountRef: "ACCT_charity1", feeBearer: "charity" });
    expect(calls[0].body).not.toHaveProperty("channels");
  });

  it("charges a saved card with the same split as a first payment", async () => {
    answers["/transaction/charge_authorization"] = { status: "success" };
    const r = await paystackGateway.chargeAuthorization({
      reference: base.reference, authorizationCode: "AUTH_abc", email: base.email, totalCents: 20_345,
      lines: base.lines, charityAccountRef: "ACCT_charity1", feeBearer: "givezy", description: "Monthly donation",
    });
    expect(r.status).toBe("success");
    expect(calls[0].body).toMatchObject({
      authorization_code: "AUTH_abc", email: base.email, amount: 20_345, currency: "ZAR", reference: base.reference,
      subaccount: "ACCT_charity1", transaction_charge: 2_345, bearer: "account",
    });
  });

  it("will not charge a split payment while who pays the gateway charge is undecided", async () => {
    await expect(
      paystackGateway.chargeAuthorization({
        reference: base.reference, authorizationCode: "AUTH_abc", email: base.email, totalCents: 20_345,
        lines: base.lines, charityAccountRef: "ACCT_charity1", feeBearer: null, description: "Monthly donation",
      }),
    ).rejects.toBeInstanceOf(GatewayError);
    expect(calls).toHaveLength(0);
  });

  it("reads the card authorisation from a verified payment", async () => {
    answers["/transaction/verify"] = {
      id: 7, status: "success", amount: 20_345, currency: "ZAR", reference: base.reference,
      authorization: { authorization_code: "AUTH_abc", reusable: true, last4: "4081", card_type: "visa ", exp_month: "12", exp_year: "2030" },
    };
    const tx = await paystackGateway.verifyTransaction(base.reference);
    expect(tx.authorization).toEqual({ code: "AUTH_abc", reusable: true, last4: "4081", brand: "visa", expires: "12/2030" });
  });

  it("a payment with no reusable card carries no usable authorisation", async () => {
    answers["/transaction/verify"] = { id: 7, status: "success", amount: 1, currency: "ZAR", reference: base.reference, authorization: { authorization_code: "AUTH_x", reusable: false } };
    expect((await paystackGateway.verifyTransaction(base.reference)).authorization?.reusable).toBe(false);
    answers["/transaction/verify"] = { id: 7, status: "success", amount: 1, currency: "ZAR", reference: base.reference };
    expect((await paystackGateway.verifyTransaction(base.reference)).authorization).toBeNull();
  });

  it("maps a charge answer: success, failed, anything else pending", async () => {
    const charge = async (status: string) => {
      answers["/transaction/charge_authorization"] = { status };
      return (await paystackGateway.chargeAuthorization({ reference: base.reference, authorizationCode: "A", email: base.email, totalCents: 1, lines: base.lines, charityAccountRef: null, feeBearer: null, description: "x" })).status;
    };
    expect(await charge("success")).toBe("success");
    expect(await charge("failed")).toBe("failed");
    expect(await charge("ongoing")).toBe("pending");
  });
});

describe("how Paystack's errors are read", () => {
  const answerWith = (status: number, body: unknown) =>
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
  const verifyError = async () => {
    try {
      await paystackGateway.verifyTransaction("11111111-1111-1111-1111-111111111111");
    } catch (e) {
      return e as InstanceType<typeof GatewayError>;
    }
    throw new Error("expected an error");
  };

  it("an answer that says no is a refusal (a failed attempt), not 'never received'", async () => {
    answerWith(400, { status: false, message: "Authorization is not active" });
    const e = await verifyError();
    expect(e).toBeInstanceOf(GatewayError);
    expect(e.refused).toBe(true);
    expect(e.notFound).toBe(false);
  });

  it("'transaction not found' is never-received, not a refusal", async () => {
    answerWith(400, { status: false, message: "Transaction reference not found" });
    const e = await verifyError();
    expect(e.notFound).toBe(true);
    expect(e.refused).toBe(false);
  });

  it("a wrong or changed key (401, 403) is an outage, never a declined card", async () => {
    answerWith(401, { status: false, message: "Invalid key" });
    expect(await verifyError()).toMatchObject({ refused: false, notFound: false });
    answerWith(403, { status: false, message: "Forbidden" });
    expect(await verifyError()).toMatchObject({ refused: false, notFound: false });
  });

  it("an outage, a rate limit or the network failing is neither", async () => {
    answerWith(502, { status: false, message: "Bad gateway" });
    expect(await verifyError()).toMatchObject({ refused: false, notFound: false });
    answerWith(429, { status: false, message: "Too many requests" });
    expect(await verifyError()).toMatchObject({ refused: false, notFound: false });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const e = await verifyError();
    expect(e).toBeInstanceOf(GatewayError);
    expect(e).toMatchObject({ refused: false, notFound: false });
  });
});

describe("split payments never quietly drop the charity", () => {
  it("with splits on, a payment without the charity's account is refused before anything is sent", async () => {
    process.env.PAYSTACK_SPLITS = "yes";
    await expect(paystackGateway.createCheckout({ ...base, charityAccountRef: null, feeBearer: "charity" })).rejects.toBeInstanceOf(GatewayError);
    await expect(
      paystackGateway.chargeAuthorization({
        reference: base.reference, authorizationCode: "AUTH_x", email: base.email, totalCents: base.totalCents,
        lines: base.lines, charityAccountRef: null, feeBearer: "charity", description: "Monthly donation",
      }),
    ).rejects.toBeInstanceOf(GatewayError);
    expect(calls).toEqual([]);
  });
});
