import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { GatewayError, type BankAccountCheck, type Payout, type PayoutLine, type CardAuthorization, type ChargeRequest, type CheckoutRequest, type PaymentGateway, type VerifiedTransaction, type WebhookEvent } from "./types";

/** Paystack's name for each bank our application offers (lower case). Banks not listed here are matched by name. */
const BANK_NAMES: Record<string, string> = {
  absa: "Absa Bank Limited, South Africa",
  "african bank": "African Bank Limited",
  capitec: "Capitec Bank Limited",
  "capitec business": "Capitec Business",
  "discovery bank": "Discovery Bank Limited",
  fnb: "First National Bank",
  investec: "Investec Bank Ltd",
  nedbank: "Nedbank",
  "standard bank": "Standard Bank South Africa",
  tymebank: "GoTyme Bank",
};

/**
 * Paystack adapter.
 *
 * NOT YET RUN AGAINST THE PAYSTACK SANDBOX: this session's network blocks
 * paystack.com and api.paystack.co. Written to Paystack's published API;
 * every call must be checked in test mode before use. Points to verify are
 * marked VERIFY.
 *
 * Checked on 26/10/2026 against Paystack's own public OpenAPI spec (github.com/PaystackOSS/openapi,
 * dist/paystack.yaml, last updated 09/06/2026): request fields and types for initialize,
 * charge_authorization, verify, subaccount, the bank list, settlements and bank/validate. The spec
 * doesn't cover webhooks or test cards; those stay VERIFY.
 *
 * Split payments (https://paystack.com/docs/payments/split-payments/): each charity is
 * registered as a Paystack SUBACCOUNT (settlement bank + account). A checkout started with
 * that subaccount pays the charity's line into its own bank account, and
 * `transaction_charge` (a flat amount, in cents) is what stays with the main account: the
 * donor's optional contribution to Givezy. `bearer` says who pays Paystack's own fee:
 * "subaccount" (the charity) or "account" (Givezy), from the platform setting
 * `gatewayChargePaidBy` (decided 14/10/2026: the charity pays it).
 *
 * Splitting is a switch: PAYSTACK_SPLITS=yes. Off, a charity takes no payments through
 * this gateway (the money would otherwise land with Givezy). Whether Paystack splits for
 * South African merchants, the exact settlement and fee behaviour (including when the
 * contribution is R0), and the bank list for ZA are all unverified: check in test mode
 * with docs/go-live-checklist.md before switching it on.
 */

const API = "https://api.paystack.co";

function secretKey(): string {
  const k = process.env.PAYSTACK_SECRET_KEY;
  if (!k) throw new Error("Missing PAYSTACK_SECRET_KEY. See .env.example.");
  return k;
}

/** How long to wait for Paystack before giving up on a call (it is then treated as unreachable, never as refused). */
const TIMEOUT_MS = 20_000;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    // Network failure or timeout: the outcome is unknown, so it is neither "not found" nor "refused".
    throw new GatewayError(`Paystack ${path} could not be reached: ${e instanceof Error ? e.message : String(e)}`);
  }
  const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null;
  if (!res.ok || !body?.status) {
    // Only a 404, or Paystack saying in words that it has no such transaction, counts as "never received".
    const notFound = res.status === 404 || /transaction reference not found|transaction not found/i.test(body?.message ?? "");
    // Paystack answered and said no to this request: 400, 402 or 422, or a 2xx with status false. A 401 or 403
    // means our key is wrong or was changed, and a 5xx or 429 that Paystack is struggling: those are outages,
    // never a declined card, so monthly donors are not stopped and saved cards not dropped because of them.
    const refused = !notFound && ([400, 402, 422].includes(res.status) || (res.ok && body?.status === false));
    throw new GatewayError(`Paystack ${path} failed: ${body?.message ?? res.status}`, { notFound, refused });
  }
  return body.data as T;
}

/** The split part of a checkout: the charity's subaccount, our flat share, and who bears Paystack's fee. */
function splitFields(req: Pick<CheckoutRequest | ChargeRequest, "charityAccountRef" | "feeBearer" | "lines">) {
  if (!req.feeBearer) throw new GatewayError("Who pays the gateway charge is not decided, so a split payment cannot start.");
  if (!Number.isSafeInteger(req.lines.contributionCents) || req.lines.contributionCents < 0) throw new GatewayError("The contribution must be a whole number of cents.");
  return {
    subaccount: req.charityAccountRef,
    // Paystack's API spec types this as a string (on initialize and on charge_authorization). Still cents.
    transaction_charge: String(req.lines.contributionCents),
    bearer: req.feeBearer === "charity" ? "subaccount" : "account",
  };
}

/**
 * With split payments on, every payment must name the charity's account: without one the whole
 * amount would settle to Givezy instead of the charity, so it is refused before anything is sent.
 */
function splitOrNone(req: Pick<CheckoutRequest | ChargeRequest, "charityAccountRef" | "feeBearer" | "lines">, splitting: boolean) {
  if (req.charityAccountRef) return splitFields(req);
  if (splitting) throw new GatewayError("This charity has no gateway account, so the payment was not started (it would not reach the charity).");
  return {};
}

/** Paystack's card authorisation, as we keep it. Not reusable (or no code): treated as none. */
function toAuthorization(a: { authorization_code?: string; reusable?: boolean; last4?: string; card_type?: string; brand?: string; exp_month?: string; exp_year?: string } | null | undefined): CardAuthorization | null {
  if (!a?.authorization_code) return null;
  return {
    code: a.authorization_code,
    reusable: a.reusable === true,
    last4: a.last4 && /^\d{4}$/.test(a.last4) ? a.last4 : null,
    brand: (a.brand ?? a.card_type ?? "").trim().toLowerCase() || null,
    expires: a.exp_month && a.exp_year ? `${a.exp_month}/${a.exp_year}` : null,
  };
}

/**
 * Paystack's bank (and its code) for the bank name the charity chose. Our application's bank names are not
 * Paystack's ("FNB" is "First National Bank", "TymeBank" is "GoTyme Bank", and Capitec has a personal and a
 * business entry). The names the application offers are mapped here, looked up in Paystack's own list each time
 * so the code is never typed in by hand. Checked against Paystack's live South African list on 23/10/2026.
 * `forChecks`: only the banks Paystack can check accounts at (`enabled_for_verification`, in its API spec).
 */
async function findBank(bankName: string, { forChecks = false }: { forChecks?: boolean } = {}): Promise<{ name: string; code: string }> {
  const banks = await call<{ name: string; code: string }[]>(`/bank?country=south%20africa&perPage=100${forChecks ? "&enabled_for_verification=true" : ""}`);
  const want = (BANK_NAMES[bankName.trim().toLowerCase()] ?? bankName).trim().toLowerCase();
  if (want === "other") throw new GatewayError(`This charity chose "Other" as its bank. Ask which bank it is and have the bank corrected on its application before connecting it.`);
  // An exact name wins; otherwise exactly one bank must contain the name ("Standard" alone could be two banks).
  const matches = banks.filter((b) => b.name.toLowerCase() === want);
  const candidates = matches.length ? matches : banks.filter((b) => b.name.toLowerCase().includes(want));
  if (candidates.length === 0) throw new GatewayError(forChecks ? `Paystack can't check accounts at "${bankName}".` : `Paystack has no bank matching "${bankName}".`);
  if (candidates.length > 1) throw new GatewayError(`More than one Paystack bank matches "${bankName}": ${candidates.map((b) => b.name).join(", ")}. Use the exact bank name.`);
  return candidates[0];
}

/** The subaccount a settlement or transaction says it belongs to, in whichever form Paystack gives it; null if it doesn't say. */
function ownerOf(x: { subaccount?: string | { subaccount_code?: string } | null; subaccount_code?: string | null }): string | null {
  if (typeof x.subaccount === "string" && x.subaccount) return x.subaccount;
  if (x.subaccount && typeof x.subaccount === "object" && x.subaccount.subaccount_code) return x.subaccount.subaccount_code;
  if (typeof x.subaccount_code === "string" && x.subaccount_code) return x.subaccount_code;
  return null;
}

export const paystackGateway: PaymentGateway = {
  name: "paystack",
  /** Off until PAYSTACK_SPLITS=yes, set once splitting is confirmed for South African merchants in test mode. */
  get splitsPayments() {
    return process.env.PAYSTACK_SPLITS === "yes";
  },

  async createCheckout(req) {
    const data = await call<{ authorization_url: string }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: req.email,
        amount: req.totalCents, // ZAR subunits (cents). VERIFY.
        currency: "ZAR",
        reference: req.reference,
        callback_url: req.returnUrl,
        // Only a card payment gives a reusable authorisation, which a monthly donation needs.
        ...(req.saveCard ? { channels: ["card"] } : {}),
        ...splitOrNone(req, paystackGateway.splitsPayments),
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
    const data = await call<{
      id: number;
      status: string;
      amount: number;
      currency: string;
      reference: string;
      paid_at?: string | null;
      authorization?: { authorization_code?: string; reusable?: boolean; last4?: string; card_type?: string; brand?: string; exp_month?: string; exp_year?: string } | null;
    }>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
    // The answer must be about the payment we asked about.
    if (data.reference !== reference) throw new GatewayError("Paystack answered about a different payment.");
    return {
      reference: data.reference,
      // "abandoned" means started and not paid yet (the donor may still pay), so it stays pending.
      status: data.status === "success" ? "success" : ["failed", "reversed"].includes(data.status) ? "failed" : "pending",
      amountCents: data.amount,
      currency: data.currency,
      gatewayTransactionId: String(data.id),
      paidAt: data.paid_at ?? null,
      authorization: toAuthorization(data.authorization),
    };
  },

  /**
   * Charge a card the donor authorised on their first payment. Same split as a first payment.
   * VERIFY in test mode: the body fields, and the shape of the answer.
   */
  async chargeAuthorization(req) {
    const data = await call<{ status: string }>("/transaction/charge_authorization", {
      method: "POST",
      body: JSON.stringify({
        authorization_code: req.authorizationCode,
        email: req.email,
        amount: req.totalCents,
        currency: "ZAR",
        reference: req.reference,
        ...splitOrNone(req, paystackGateway.splitsPayments),
        // Paystack's API spec: on charge_authorization, metadata is "Stringified JSON" (on initialize it is an object).
        metadata: JSON.stringify({ description: req.description, charity_cents: req.lines.charityCents, contribution_cents: req.lines.contributionCents, monthly: req.monthly ?? true }),
      }),
    });
    return { status: data.status === "success" ? ("success" as const) : ["failed", "reversed"].includes(data.status) ? ("failed" as const) : ("pending" as const) };
  },

  async parseWebhook(rawBody, headers): Promise<WebhookEvent | null> {
    // Signature: HMAC-SHA512 of the raw body with the secret key, hex, in x-paystack-signature. VERIFY.
    const expected = createHmac("sha512", secretKey()).update(rawBody).digest("hex");
    const got = headers.get("x-paystack-signature") ?? "";
    // Compare as bytes, so odd characters in the header are a plain "no" and never an error.
    const gotBytes = Buffer.from(got, "hex");
    const expectedBytes = Buffer.from(expected, "hex");
    if (!/^[0-9a-f]{128}$/i.test(got) || gotBytes.length !== expectedBytes.length || !timingSafeEqual(gotBytes, expectedBytes)) return null;
    type Data = {
      id?: number;
      reference?: string;
      amount?: number;
      currency?: string;
      resolution?: string;
      status?: string;
      transaction_reference?: string;
      transaction?: { reference?: string };
    };
    const body = JSON.parse(rawBody) as { event: string; data?: Data };
    const d = body.data ?? {};
    // Refunds and disputes name the original payment. The field names are not confirmed against a live
    // payload yet: VERIFY in Paystack's test mode (docs/paystack-test-script.md). Unknown shapes leave the
    // reference empty, so the event is held for a person instead of changing anything.
    const original = d.transaction_reference ?? d.transaction?.reference ?? null;
    const type: WebhookEvent["type"] =
      body.event === "charge.success" ? "payment_succeeded"
      : body.event === "charge.failed" ? "payment_failed"
      : body.event === "refund.processed" ? "refund_processed"
      : body.event === "charge.dispute.create" ? "dispute_opened"
      : body.event === "charge.dispute.resolve" ? "dispute_resolved"
      : "other";
    const isPayment = type === "payment_succeeded" || type === "payment_failed";
    return {
      // Paystack events carry no event id; event type + transaction id is unique. VERIFY.
      eventId: `${body.event}:${d.id ?? d.reference ?? original ?? "unknown"}`,
      type,
      reference: isPayment ? (d.reference ?? null) : original,
      // Paystack amounts are in the smallest unit (cents for rand). VERIFY for refunds.
      amountCents: type === "refund_processed" && Number.isSafeInteger(d.amount) ? (d.amount as number) : null,
      currency: type === "refund_processed" && typeof d.currency === "string" ? d.currency : null,
      detail: type === "dispute_resolved" ? (d.resolution ?? d.status ?? null) : null,
      // What we keep of the event. Never the whole body: a charge carries the reusable card code
      // (authorization) and the customer's details, which are kept encrypted or not at all elsewhere.
      // `reference` is the donation's own reference, so an erasure finds refund and dispute rows too.
      raw: {
        event: body.event,
        reference: isPayment ? (d.reference ?? null) : original,
        data: { id: d.id ?? null, amount: d.amount ?? null, currency: d.currency ?? null, status: d.status ?? null, resolution: d.resolution ?? null },
      },
    };
  },

  async createCharityAccount(req) {
    // Paystack needs its own bank code, looked up from its bank list. VERIFY
    // the South African list and how ZA account verification works.
    const bank = await findBank(req.bankName);
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

  /**
   * Check a charity's bank account with the bank (POST /bank/validate, from Paystack's API spec: South African
   * accounts). Information for the Givezy admin only. A charity is a business, so the account type is "business"
   * and the document type a business registration number; Givezy holds no company registration number, so
   * none is sent (the spec doesn't require one). VERIFY in test mode: that this works for charity accounts, what
   * the bank needs to match the holder, and whether the call costs anything.
   */
  async checkBankAccount(req): Promise<BankAccountCheck> {
    const bank = await findBank(req.bankName, { forChecks: true });
    const data = await call<{
      verified?: boolean; verificationMessage?: string; accountOpen?: boolean; accountAcceptsCredits?: boolean;
      accountHolderMatch?: boolean; accountOpenForMoreThanThreeMonths?: boolean;
    }>("/bank/validate", {
      method: "POST",
      body: JSON.stringify({
        account_name: req.accountHolder,
        account_number: req.accountNumber,
        account_type: "business",
        bank_code: bank.code,
        country_code: "ZA",
        document_type: "businessRegistrationNumber",
      }),
    });
    // Only an explicit "true" counts: anything missing reads as no, never as yes.
    return {
      verified: data?.verified === true,
      accountOpen: data?.accountOpen === true,
      acceptsCredits: data?.accountAcceptsCredits === true,
      holderMatches: data?.accountHolderMatch === true,
      openMoreThanThreeMonths: data?.accountOpenForMoreThanThreeMonths === true,
      message: typeof data?.verificationMessage === "string" && data.verificationMessage.trim() ? data.verificationMessage.trim().slice(0, 300) : null,
    };
  },

  /**
   * Payouts ("settlements") to one charity's subaccount, each with its transactions. Amounts are in the
   * smallest unit (cents for rand). VERIFY in test mode, before any charity sees the report: that
   * /settlement filters by subaccount; the names of the date, amount, fee and status fields; whether a
   * transaction's amount is the whole charge or the subaccount's share; and how refunds and chargebacks
   * taken out of a settlement are listed. Until then the report's own check (each gift minus its fee
   * equals what reached the bank, and the lines add up to the deposit) shows any mismatch.
   *
   * Paystack's API spec lists only `perPage` and `page` for GET /settlement. The `subaccount` and `from`
   * filters are still sent (Paystack's docs site may support them), but nothing here relies on them: a
   * settlement is kept only when it is shown to be this charity's (its own subaccount field, or else every one of
   * its transactions naming this subaccount), and anything paid out before `since` is dropped. A settlement that
   * can't be shown to be this charity's is left out: another charity's money must never appear in a deposit report.
   */
  async listPayouts({ charityAccountRef, since }) {
    const out: Payout[] = [];
    type Owned = { subaccount?: string | { subaccount_code?: string } | null; subaccount_code?: string | null };
    for (let page = 1; page <= 20; page++) {
      const settlements = await call<
        ({ id: number; status: string; settlement_date?: string; createdAt?: string; effective_amount?: number; total_amount?: number } & Owned)[]
      >(`/settlement?subaccount=${encodeURIComponent(charityAccountRef)}&from=${encodeURIComponent(since)}&perPage=100&page=${page}`);
      for (const st of settlements) {
        const day = String(st.settlement_date ?? st.createdAt ?? "").slice(0, 10);
        const dated = /^\d{4}-\d{2}-\d{2}$/.test(day);
        // Before `since`: not asked for (the filter may have been ignored).
        if (dated && day < since) continue;
        const owner = ownerOf(st);
        // Another charity's settlement (or Givezy's own), when it says so: its transactions aren't even read.
        if (owner !== null && owner !== charityAccountRef) continue;
        const lines: PayoutLine[] = [];
        const txOwners: (string | null)[] = [];
        let someoneElses = false;
        for (let tp = 1; tp <= 50 && !someoneElses; tp++) {
          const txs = await call<({ reference?: string | null; amount?: number; fees?: number; type?: string; status?: string } & Owned)[]>(
            `/settlement/${st.id}/transactions?perPage=100&page=${tp}`,
          );
          for (const t of txs) {
            const txOwner = ownerOf(t);
            txOwners.push(txOwner);
            // A transaction that names another subaccount settles it: this isn't the charity's, stop reading it.
            if (owner === null && txOwner !== null && txOwner !== charityAccountRef) {
              someoneElses = true;
              break;
            }
            const gross = Number(t.amount ?? 0);
            const fee = Number(t.fees ?? 0);
            const kind = t.type === "refund" ? "refund" : t.type === "dispute" || t.type === "chargeback" ? "chargeback" : t.type === undefined || t.type === "transaction" ? "payment" : "other";
            const sign = kind === "refund" || kind === "chargeback" ? -1 : 1;
            lines.push({ reference: t.reference ?? null, kind, grossCents: sign * Math.abs(gross), feeCents: fee, netCents: sign * Math.abs(gross) - fee });
          }
          if (txs.length < 100) break;
        }
        // No owner on the settlement itself: it is this charity's only if every transaction in it says so.
        if (owner === null && (txOwners.length === 0 || txOwners.some((o) => o !== charityAccountRef))) {
          console.warn(`[paystack] settlement ${st.id} left out of a deposit report: it could not be shown to be this charity's`);
          continue;
        }
        out.push({
          ref: String(st.id),
          paidOutOn: dated ? day : since,
          amountCents: Number(st.effective_amount ?? st.total_amount ?? 0),
          status: st.status === "success" || st.status === "processed" ? "paid" : st.status === "failed" ? "failed" : "pending",
          lines,
        });
      }
      if (settlements.length < 100) break;
    }
    return out;
  },
};
