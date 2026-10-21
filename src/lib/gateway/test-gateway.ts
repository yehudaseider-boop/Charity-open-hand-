import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isoDateInJhb } from "@/lib/dates";
import { GatewayError, type PaymentGateway, type PayoutLine, type VerifiedTransaction, type WebhookEvent } from "./types";

/**
 * A stand-in gateway for local development and automated tests. It shows a
 * simple "pay / decline" page inside this app and sends a signed webhook,
 * the same way a real gateway would. It never moves money and is refused in
 * production (see index.ts).
 */

function secret(): string {
  const s = process.env.TEST_GATEWAY_SECRET;
  if (!s) throw new Error("Missing TEST_GATEWAY_SECRET. See .env.example.");
  return s;
}

export function testGatewaySign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

/** The query keys the test checkout page signs, in order. */
export const TEST_CHECKOUT_KEYS = ["reference", "total", "charity", "contribution", "account", "email", "return"] as const;

/**
 * Rebuild and check a signed test checkout. Returns the signed values, or
 * null if anything was changed after we signed it.
 */
export function readSignedTestCheckout(get: (key: string) => string | null | undefined, sig: unknown) {
  const params = new URLSearchParams();
  for (const k of TEST_CHECKOUT_KEYS) params.set(k, get(k) ?? "");
  if (typeof sig !== "string" || !safeEqual(sig, testGatewaySign(params.toString()))) return null;
  return params;
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const testGateway: PaymentGateway = {
  name: "test",
  /**
   * Behaves like a gateway that cannot split unless TEST_GATEWAY_SPLITS=yes, which lets the
   * direct-to-charity path be tried locally (a charity then needs a connected test account).
   */
  get splitsPayments() {
    return process.env.TEST_GATEWAY_SPLITS === "yes";
  },

  async createCheckout(req) {
    const params = new URLSearchParams({
      reference: req.reference,
      total: String(req.totalCents),
      charity: String(req.lines.charityCents),
      contribution: String(req.lines.contributionCents),
      account: req.charityAccountRef ?? "",
      email: req.email,
      return: req.returnUrl,
    });
    params.set("sig", testGatewaySign(params.toString()));
    // A full address, so the phone app (which only opens https pages) can show it too.
    return { redirectUrl: `${process.env.SITE_URL ?? ""}/test-gateway?${params}` };
  },

  async verifyTransaction(reference): Promise<VerifiedTransaction> {
    // The test gateway's "server" is its own recorded events.
    const { data } = await createAdminClient()
      .from("gateway_events")
      .select("payload")
      .eq("gateway", "test")
      .eq("payload->>reference", reference)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const p = data?.payload as
      | { outcome?: string; amount?: number; reference?: string; authorization?: { code: string; reusable: boolean; last4: string; brand: string; expires: string } }
      | undefined;
    return {
      reference,
      status: p?.outcome === "success" ? "success" : p?.outcome === "failed" ? "failed" : "pending",
      amountCents: p?.amount ?? 0,
      currency: "ZAR",
      gatewayTransactionId: `test_${reference}`,
      authorization: p?.authorization ?? null,
    };
  },

  /** A card authorisation whose code contains "decline" is refused, like a card that has been stopped. */
  async chargeAuthorization(req) {
    const outcome = req.authorizationCode.includes("decline") ? "failed" : "success";
    const payload = {
      id: randomUUID(),
      outcome,
      reference: req.reference,
      amount: req.totalCents,
      authorization: { code: req.authorizationCode, reusable: true, last4: "4081", brand: "visa", expires: "12/2030" },
    };
    const { error } = await createAdminClient()
      .from("gateway_events")
      .insert({ gateway: "test", event_id: payload.id, event_type: outcome === "success" ? "payment_succeeded" : "payment_failed", payload, processed_at: new Date().toISOString() });
    if (error) throw new GatewayError(`Test gateway could not record the charge: ${error.message}`);
    return { status: outcome === "success" ? ("success" as const) : ("failed" as const) };
  },

  async parseWebhook(rawBody, headers): Promise<WebhookEvent | null> {
    const sig = headers.get("x-test-signature") ?? "";
    if (!safeEqual(sig, testGatewaySign(rawBody))) return null;
    const body = JSON.parse(rawBody) as { id: string; outcome: string; reference: string; amount?: number; resolution?: string };
    const type: WebhookEvent["type"] =
      body.outcome === "success" ? "payment_succeeded"
      : body.outcome === "failed" ? "payment_failed"
      : body.outcome === "refunded" ? "refund_processed"
      : body.outcome === "dispute" ? "dispute_opened"
      : body.outcome === "dispute_resolved" ? "dispute_resolved"
      : "other";
    return {
      eventId: body.id,
      type,
      reference: body.reference,
      amountCents: type === "refund_processed" && Number.isSafeInteger(body.amount) ? (body.amount as number) : null,
      // The test gateway only ever works in rand.
      currency: type === "refund_processed" ? "ZAR" : null,
      detail: type === "dispute_resolved" ? (body.resolution ?? null) : null,
      raw: body,
    };
  },

  async createCharityAccount(req) {
    return { accountRef: `test_acct_${req.charityId.slice(0, 8)}` };
  },

  /**
   * Pretend payouts: each day's paid test gifts to the charity paid out the next day, and a refund or
   * chargeback taken out of the payout on the day after it. The test gateway charges no fee unless
   * TEST_GATEWAY_FEE_PPM is set (parts per million, local testing only): it never stands for a real rate.
   */
  async listPayouts({ charityId, since }) {
    const ppm = BigInt(/^\d{1,6}$/.test(process.env.TEST_GATEWAY_FEE_PPM ?? "") ? process.env.TEST_GATEWAY_FEE_PPM! : "0");
    const feeOf = (cents: number) => Number((BigInt(cents) * ppm + 500_000n) / 1_000_000n);
    const nextDay = (iso: string) => {
      const d = new Date(Date.parse(`${isoDateInJhb(new Date(iso))}T12:00:00+02:00`) + 86_400_000);
      return isoDateInJhb(d);
    };
    const { data, error } = await createAdminClient()
      .from("donations")
      .select("id, amount_cents, status, paid_at, refunded_at, charged_back_at")
      .eq("charity_id", charityId)
      .eq("gateway", "test")
      .in("status", ["paid", "refunded", "charged_back"])
      .gte("paid_at", `${since}T00:00:00+02:00`)
      .order("paid_at")
      .limit(5000);
    if (error) throw new GatewayError(`Test gateway could not read its payments: ${error.message}`);
    const byDay = new Map<string, PayoutLine[]>();
    const add = (day: string, line: PayoutLine) => byDay.set(day, [...(byDay.get(day) ?? []), line]);
    for (const d of data ?? []) {
      const cents = Number(d.amount_cents);
      const fee = feeOf(cents);
      add(nextDay(d.paid_at as string), { reference: d.id as string, kind: "payment", grossCents: cents, feeCents: fee, netCents: cents - fee });
      const back = (d.refunded_at ?? d.charged_back_at) as string | null;
      if (back) add(nextDay(back), { reference: d.id as string, kind: d.refunded_at ? "refund" : "chargeback", grossCents: -cents, feeCents: 0, netCents: -cents });
    }
    const today = isoDateInJhb(new Date());
    return [...byDay.entries()].map(([day, lines]) => ({
      ref: `test_payout_${charityId.slice(0, 8)}_${day}`,
      paidOutOn: day,
      amountCents: lines.reduce((t, l) => t + l.netCents, 0),
      status: day <= today ? ("paid" as const) : ("pending" as const),
      lines,
    }));
  },
};
