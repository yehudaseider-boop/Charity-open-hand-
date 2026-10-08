import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { GatewayError, type PaymentGateway, type VerifiedTransaction, type WebhookEvent } from "./types";

/**
 * Paystack adapter.
 *
 * NOT YET RUN AGAINST THE PAYSTACK SANDBOX: this session's network blocks
 * paystack.com and api.paystack.co. Written to Paystack's published API;
 * every call must be checked in test mode before use. Points to verify are
 * marked VERIFY.
 *
 * Split: when the charity has a subaccount, its subaccount receives the
 * donation line and `transaction_charge` (the NEDIV lev contribution) goes to
 * our main account. Whether Paystack splits for South African merchants is an
 * OPEN QUESTION, and so is who bears Paystack's own fee (`bearer`): it depends
 * on who pays the gateway charge, which is not decided. VERIFY in sandbox.
 */

const API = "https://api.paystack.co";

function secretKey(): string {
  const k = process.env.PAYSTACK_SECRET_KEY;
  if (!k) throw new Error("Missing PAYSTACK_SECRET_KEY. See .env.example.");
  return k;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null;
  if (!res.ok || !body?.status) {
    throw new GatewayError(`Paystack ${path} failed: ${body?.message ?? res.status}`);
  }
  return body.data as T;
}

export const paystackGateway: PaymentGateway = {
  name: "paystack",
  /** OPEN QUESTION: not confirmed for South African merchants. Off until it is. */
  splitsPayments: false,

  async createCheckout(req) {
    const data = await call<{ authorization_url: string }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: req.email,
        amount: req.totalCents, // ZAR subunits (cents). VERIFY.
        currency: "ZAR",
        reference: req.reference,
        callback_url: req.returnUrl,
        ...(req.charityAccountRef
          ? { subaccount: req.charityAccountRef, transaction_charge: req.lines.contributionCents, bearer: "account" }
          : {}),
        metadata: {
          description: req.description,
          charity_cents: req.lines.charityCents,
          contribution_cents: req.lines.contributionCents,
        },
      }),
    });
    return { redirectUrl: data.authorization_url };
  },

  async verifyTransaction(reference): Promise<VerifiedTransaction> {
    const data = await call<{ id: number; status: string; amount: number; currency: string; reference: string; paid_at?: string | null }>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
    return {
      reference: data.reference,
      status: data.status === "success" ? "success" : ["failed", "abandoned", "reversed"].includes(data.status) ? "failed" : "pending",
      amountCents: data.amount,
      currency: data.currency,
      gatewayTransactionId: String(data.id),
      paidAt: data.paid_at ?? null,
    };
  },

  async parseWebhook(rawBody, headers): Promise<WebhookEvent | null> {
    // Signature: HMAC-SHA512 of the raw body with the secret key, hex, in x-paystack-signature. VERIFY.
    const expected = createHmac("sha512", secretKey()).update(rawBody).digest("hex");
    const got = headers.get("x-paystack-signature") ?? "";
    if (got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return null;
    const body = JSON.parse(rawBody) as { event: string; data?: { id?: number; reference?: string } };
    return {
      // Paystack events carry no event id; event type + transaction id is unique. VERIFY.
      eventId: `${body.event}:${body.data?.id ?? body.data?.reference ?? "unknown"}`,
      type: body.event === "charge.success" ? "payment_succeeded" : body.event === "charge.failed" ? "payment_failed" : "other",
      reference: body.data?.reference ?? null,
      raw: body,
    };
  },

  async createCharityAccount(req) {
    // Paystack needs its own bank code, looked up from its bank list. VERIFY
    // the South African list and how ZA account verification works.
    const banks = await call<{ name: string; code: string }[]>("/bank?country=south%20africa");
    const bank = banks.find((b) => b.name.toLowerCase().includes(req.bankName.toLowerCase()));
    if (!bank) throw new GatewayError(`Paystack has no bank matching "${req.bankName}".`);
    const data = await call<{ subaccount_code: string }>("/subaccount", {
      method: "POST",
      body: JSON.stringify({
        business_name: req.businessName,
        settlement_bank: bank.code,
        account_number: req.accountNumber,
        percentage_charge: 0, // our share is set per transaction instead
      }),
    });
    return { accountRef: data.subaccount_code };
  },
};
