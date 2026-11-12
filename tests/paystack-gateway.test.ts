/**
 * The Paystack adapter against a stubbed network: what it sends (split payments), how it
 * reads Paystack's answers, and how it checks webhook signatures. Nothing here talks to
 * Paystack; the real behaviour still has to be checked in Paystack's test mode.
 */
import { createHash, createHmac } from "node:crypto";
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
      // Paystack's API spec types transaction_charge as a string. Still cents.
      transaction_charge: "2345",
      bearer: "subaccount",
    });
  });

  it("each side paying its own share sends an inline flat split, the charity's line to its subaccount, fee in proportion", async () => {
    await paystackGateway.createCheckout({ ...base, charityAccountRef: "ACCT_charity1", feeBearer: "each" });
    expect(calls[0].body).toMatchObject({
      amount: 20_345,
      split: { type: "flat", currency: "ZAR", bearer_type: "all-proportional", subaccounts: [{ subaccount: "ACCT_charity1", share: 18_000 }] },
    });
    expect(calls[0].body).not.toHaveProperty("subaccount");
    expect(calls[0].body).not.toHaveProperty("transaction_charge");
    expect(calls[0].body).not.toHaveProperty("bearer");
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

  it("keeps the charity and contribution lines in the metadata (an object on initialize, as the spec says)", async () => {
    await paystackGateway.createCheckout({ ...base, charityAccountRef: "ACCT_charity1", feeBearer: "charity" });
    expect(calls[0].body!.metadata).toMatchObject({ charity_cents: 18_000, contribution_cents: 2_345 });
  });

  it("a R0 contribution is sent as \"0\", and a contribution that isn't whole cents is refused", async () => {
    await paystackGateway.createCheckout({ ...base, totalCents: 18_000, lines: { charityCents: 18_000, contributionCents: 0 }, charityAccountRef: "ACCT_charity1", feeBearer: "charity" });
    expect(calls[0].body).toMatchObject({ transaction_charge: "0" });
    await expect(paystackGateway.createCheckout({ ...base, lines: { charityCents: 18_000, contributionCents: 23.45 }, charityAccountRef: "ACCT_charity1", feeBearer: "charity" })).rejects.toBeInstanceOf(GatewayError);
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
    expect(await paystackGateway.parseWebhook(refund, headers(sign(refund)))).toMatchObject({ type: "refund_processed", reference: base.reference, amountCents: 18000, eventId: "refund.processed:7:18000" });
    const opened = JSON.stringify({ event: "charge.dispute.create", data: { id: 8, transaction: { reference: base.reference } } });
    expect(await paystackGateway.parseWebhook(opened, headers(sign(opened)))).toMatchObject({ type: "dispute_opened", reference: base.reference });
    const resolved = JSON.stringify({ event: "charge.dispute.resolve", data: { id: 9, resolution: "declined", transaction: { reference: base.reference } } });
    expect(await paystackGateway.parseWebhook(resolved, headers(sign(resolved)))).toMatchObject({ type: "dispute_resolved", reference: base.reference, detail: "declined" });
    // An event naming no id or reference is told apart by its body's fingerprint, never one fixed key.
    const bare1 = JSON.stringify({ event: "refund.processed", data: { amount: 100 } });
    const bare2 = JSON.stringify({ event: "refund.processed", data: { amount: 200 } });
    const id1 = (await paystackGateway.parseWebhook(bare1, headers(sign(bare1))))?.eventId;
    const id2 = (await paystackGateway.parseWebhook(bare2, headers(sign(bare2))))?.eventId;
    expect(id1).toBe(`refund.processed:?:100:sha256:${createHash("sha256").update(bare1).digest("hex")}`);
    expect(id2).not.toBe(id1);
    expect((await paystackGateway.parseWebhook(bare1, headers(sign(bare1))))?.eventId).toBe(id1);
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
      subaccount: "ACCT_charity1", transaction_charge: "2345", bearer: "account",
    });
    // On charge_authorization the spec says metadata is "Stringified JSON".
    expect(typeof calls[0].body!.metadata).toBe("string");
    expect(JSON.parse(calls[0].body!.metadata as string)).toEqual({ description: "Monthly donation", charity_cents: 18_000, contribution_cents: 2_345, monthly: true });
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
    expect(e.said).toBe("Authorization is not active");
    expect(e.unreachable).toBe(false);
  });

  it("'transaction not found' is never-received, not a refusal", async () => {
    answerWith(400, { status: false, message: "Transaction reference not found" });
    const e = await verifyError();
    expect(e.notFound).toBe(true);
    expect(e.refused).toBe(false);
  });

  it("a duplicate reference is never a refusal: a payment under it already reached Paystack", async () => {
    answerWith(400, { status: false, message: "Duplicate Transaction Reference" });
    expect(await verifyError()).toMatchObject({ refused: false, notFound: false });
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
    expect(e).toMatchObject({ refused: false, notFound: false, unreachable: true });
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

describe("deposits: settlements are kept to this charity's own money", () => {
  // Paystack's API spec lists only perPage and page for GET /settlement, so the subaccount and from filters
  // may be ignored. These answers ignore them: every settlement on the integration comes back.
  const tx = (reference: string, subaccount: unknown, amount = 10_000, fees = 300) => ({ reference, amount, fees, subaccount });
  function answer(settlements: Record<string, unknown>[], txsById: Record<string, Record<string, unknown>[]>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = url.replace("https://api.paystack.co", "");
        calls.push({ url: path, body: null });
        const m = /^\/settlement\/(\d+)\/transactions/.exec(path);
        const data = m ? txsById[m[1]] ?? [] : path.startsWith("/settlement?") ? settlements : [];
        return new Response(JSON.stringify({ status: true, data }), { status: 200 });
      }),
    );
  }
  const ours = "ACCT_ours";

  it("still asks with the filters, but never shows another charity's settlement", async () => {
    answer(
      [
        { id: 1, status: "success", settlement_date: "2026-10-20T08:00:00Z", total_amount: 9_700, subaccount: { subaccount_code: ours } },
        { id: 2, status: "success", settlement_date: "2026-10-20T08:00:00Z", total_amount: 50_000, subaccount: { subaccount_code: "ACCT_other" } },
        { id: 3, status: "success", settlement_date: "2026-10-21", total_amount: 9_700, subaccount: "ACCT_other" },
      ],
      { "1": [tx("d1", ours)], "2": [tx("x1", "ACCT_other")], "3": [tx("x2", "ACCT_other")] },
    );
    const out = await paystackGateway.listPayouts({ charityId: "c1", charityAccountRef: ours, since: "2026-10-01" });
    expect(out.map((p) => p.ref)).toEqual(["1"]);
    expect(calls[0].url).toContain("subaccount=ACCT_ours");
    expect(calls[0].url).toContain("from=2026-10-01");
    // Another charity's settlement isn't even opened.
    expect(calls.some((c) => c.url.startsWith("/settlement/2/") || c.url.startsWith("/settlement/3/"))).toBe(false);
  });

  it("without an owner on the settlement, keeps it only when every transaction is this charity's", async () => {
    answer(
      [
        { id: 10, status: "success", settlement_date: "2026-10-20" },
        { id: 11, status: "success", settlement_date: "2026-10-20" },
        { id: 12, status: "success", settlement_date: "2026-10-20" },
        { id: 13, status: "success", settlement_date: "2026-10-20" },
      ],
      {
        "10": [tx("d1", { subaccount_code: ours }), tx("d2", ours)],
        "11": [tx("d3", ours), tx("x1", "ACCT_other")],
        "12": [tx("x2", null)],
        "13": [],
      },
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await paystackGateway.listPayouts({ charityId: "c1", charityAccountRef: ours, since: "2026-10-01" });
    expect(out.map((p) => p.ref)).toEqual(["10"]);
    expect(out[0].lines.map((l) => l.reference)).toEqual(["d1", "d2"]);
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it("stops reading a settlement's transactions as soon as one names another charity", async () => {
    const many = Array.from({ length: 100 }, (_, i) => tx(`x${i}`, "ACCT_other"));
    answer([{ id: 30, status: "success", settlement_date: "2026-10-20" }], { "30": many });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await paystackGateway.listPayouts({ charityId: "c1", charityAccountRef: ours, since: "2026-10-01" })).toEqual([]);
    warn.mockRestore();
    // One page of its transactions, not fifty.
    expect(calls.filter((c) => c.url.startsWith("/settlement/30/")).length).toBe(1);
  });

  it("drops anything paid out before the day asked for", async () => {
    answer(
      [
        { id: 20, status: "success", settlement_date: "2026-09-30T23:00:00Z", subaccount: ours },
        { id: 21, status: "success", settlement_date: "2026-10-01", subaccount: ours },
      ],
      { "20": [tx("d0", ours)], "21": [tx("d1", ours)] },
    );
    const out = await paystackGateway.listPayouts({ charityId: "c1", charityAccountRef: ours, since: "2026-10-01" });
    expect(out.map((p) => [p.ref, p.paidOutOn])).toEqual([["21", "2026-10-01"]]);
  });
});

describe("checking a charity's bank account (POST /bank/validate)", () => {
  it("looks the bank up among the banks Paystack can check, and sends what the spec asks for", async () => {
    // The fake answers by the first matching path prefix: the longer path goes first.
    answers["/bank/validate"] = { verified: true, verificationMessage: "Account is verified", accountOpen: true, accountAcceptsCredits: true, accountAcceptsDebits: true, accountHolderMatch: true, accountOpenForMoreThanThreeMonths: true };
    answers["/bank"] = [{ name: "First National Bank", code: "250655" }];
    const r = await paystackGateway.checkBankAccount!({ bankName: "FNB", accountNumber: "62000000000", accountHolder: "Meals Fund NPC" });
    expect(calls[0].url).toContain("enabled_for_verification=true");
    expect(calls[0].url).toContain("country=south%20africa");
    expect(calls[1].url).toBe("/bank/validate");
    expect(calls[1].body).toEqual({ account_name: "Meals Fund NPC", account_number: "62000000000", account_type: "business", bank_code: "250655", country_code: "ZA", document_type: "businessRegistrationNumber" });
    expect(r).toEqual({ verified: true, accountOpen: true, acceptsCredits: true, holderMatches: true, openMoreThanThreeMonths: true, message: "Account is verified" });
  });

  it("anything missing from the answer reads as no, never as yes", async () => {
    answers["/bank/validate"] = { verified: "true", accountOpen: 1 };
    answers["/bank"] = [{ name: "First National Bank", code: "250655" }];
    expect(await paystackGateway.checkBankAccount!({ bankName: "FNB", accountNumber: "1", accountHolder: "X" })).toEqual({ verified: false, accountOpen: false, acceptsCredits: false, holderMatches: false, openMoreThanThreeMonths: false, message: null });
  });

  it("a bank Paystack can't check at is an error (shown as not checked), not a failed check", async () => {
    answers["/bank"] = [];
    await expect(paystackGateway.checkBankAccount!({ bankName: "FNB", accountNumber: "1", accountHolder: "X" })).rejects.toBeInstanceOf(GatewayError);
  });
});

describe("which charge answers are a declined card", () => {
  const charge = async (status: number, body: unknown) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
    try {
      await paystackGateway.chargeAuthorization({ ...base, authorizationCode: "AUTH_x", charityAccountRef: null, feeBearer: "charity" });
    } catch (e) {
      return e as InstanceType<typeof GatewayError>;
    }
    throw new Error("expected an error");
  };

  it("a refusal that names the card is a decline", async () => {
    for (const message of ["Declined", "Insufficient Funds", "Do not honor", "Authorization is not active", "This authorization is not reusable", "Expired card"]) {
      expect(await charge(400, { status: false, message })).toMatchObject({ refused: true, declined: true });
    }
  });

  it("any other 400 or 422 is turned down but never a declined card (the donor is not told so, the card is kept)", async () => {
    for (const message of ["Invalid split configuration", "Invalid amount", "Subaccount not found", "Currency not supported by merchant", "Invalid authorization code"]) {
      expect(await charge(400, { status: false, message })).toMatchObject({ refused: true, declined: false });
      expect(await charge(422, { status: false, message })).toMatchObject({ refused: true, declined: false });
    }
  });

  it("an outage, a wrong key, a rate limit, a duplicate reference or the network failing is never a decline", async () => {
    expect(await charge(500, { status: false, message: "Declined" })).toMatchObject({ declined: false });
    expect(await charge(401, { status: false, message: "Invalid key" })).toMatchObject({ declined: false });
    expect(await charge(429, { status: false, message: "Too many requests" })).toMatchObject({ declined: false });
    expect(await charge(400, { status: false, message: "Duplicate Transaction Reference" })).toMatchObject({ declined: false });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    try {
      await paystackGateway.chargeAuthorization({ ...base, authorizationCode: "AUTH_x", charityAccountRef: null, feeBearer: "charity" });
    } catch (e) {
      expect(e).toMatchObject({ unreachable: true, declined: false });
    }
  });

  it("a 200 saying the charge failed is read as failed (the payment check then marks it declined)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: true, data: { status: "failed" } }), { status: 200 })));
    expect(await paystackGateway.chargeAuthorization({ ...base, authorizationCode: "AUTH_x", charityAccountRef: null, feeBearer: "charity" })).toEqual({ status: "failed" });
  });
});

describe("an abandoned checkout", () => {
  it("stays pending, and says it was abandoned", async () => {
    answers["/transaction/verify"] = { id: 42, status: "abandoned", amount: 20_345, currency: "ZAR", reference: base.reference };
    expect(await paystackGateway.verifyTransaction(base.reference)).toMatchObject({ status: "pending", abandoned: true });
    answers["/transaction/verify"] = { id: 42, status: "ongoing", amount: 20_345, currency: "ZAR", reference: base.reference };
    expect(await paystackGateway.verifyTransaction(base.reference)).toMatchObject({ status: "pending", abandoned: false });
  });
});

describe("refund events", () => {
  const sign = (raw: string) => createHmac("sha512", "sk_test_unit").update(raw).digest("hex");
  const parse = (data: Record<string, unknown>) => {
    const raw = JSON.stringify({ event: "refund.processed", data: { transaction_reference: base.reference, currency: "ZAR", ...data } });
    return paystackGateway.parseWebhook(raw, new Headers({ "x-paystack-signature": sign(raw) }));
  };

  it("two partial refunds of one payment are two events, never one dropped as a repeat", async () => {
    const first = await parse({ refund_reference: "RF_1", amount: "5000" });
    const second = await parse({ refund_reference: "RF_2", amount: "5000" });
    expect(first?.eventId).toBe("refund.processed:RF_1:5000");
    expect(second?.eventId).toBe("refund.processed:RF_2:5000");
    // With no refund id at all, two different amounts are still two events.
    const a = await parse({ amount: 5000 });
    const b = await parse({ amount: 3000 });
    expect(a?.eventId).not.toBe(b?.eventId);
    // A repeat delivery of the same refund is the same event.
    expect((await parse({ refund_reference: "RF_1", amount: "5000" }))?.eventId).toBe(first?.eventId);
  });

  it("reads an amount sent as a string of digits as whole cents", async () => {
    expect(await parse({ refund_reference: "RF_1", amount: "18000" })).toMatchObject({ amountCents: 18000 });
    expect(await parse({ refund_reference: "RF_1", amount: 18000 })).toMatchObject({ amountCents: 18000 });
  });

  it("an amount that isn't whole cents is not read (the refund is held for a person)", async () => {
    for (const amount of ["180.50", "-100", "1e5", "", "abc", 180.5, -1, "99999999999999999999", null]) {
      expect((await parse({ refund_reference: "RF_1", amount }))?.amountCents).toBeNull();
    }
  });
});

describe("deposits in a time budget", () => {
  const ours = "ACCT_ours";
  const settlement = (id: number) => ({ id, status: "success", settlement_date: "2026-10-20", total_amount: 9_700, subaccount: ours });
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = url.replace("https://api.paystack.co", "");
        calls.push({ url: path, body: null });
        const data = path.startsWith("/settlement?") ? [settlement(1), settlement(2), settlement(3)] : [{ reference: "d1", amount: 10_000, fees: 300, subaccount: ours }];
        return new Response(JSON.stringify({ status: true, data }), { status: 200 });
      }),
    );
  });

  it("settlements already kept as final are left out without reading their transactions", async () => {
    const out = await paystackGateway.listPayouts({ charityId: "c1", charityAccountRef: ours, since: "2026-10-01", skipRefs: new Set(["1", "3"]) });
    expect(out.map((p) => p.ref)).toEqual(["2"]);
    expect(calls.filter((c) => c.url.includes("/transactions")).map((c) => c.url)).toEqual(["/settlement/2/transactions?perPage=100&page=1"]);
  });

  it("past the deadline, no new settlement is started; only those read in full come back", async () => {
    const out = await paystackGateway.listPayouts({ charityId: "c1", charityAccountRef: ours, since: "2026-10-01", deadline: Date.now() - 1 });
    expect(out).toEqual([]);
    expect(calls.some((c) => c.url.includes("/transactions"))).toBe(false);
  });
});
