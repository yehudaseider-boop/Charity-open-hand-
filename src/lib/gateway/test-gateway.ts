import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { GatewayError, type PaymentGateway, type VerifiedTransaction, type WebhookEvent } from "./types";

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
    return { redirectUrl: `/test-gateway?${params}` };
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
    const body = JSON.parse(rawBody) as { id: string; outcome: string; reference: string };
    return {
      eventId: body.id,
      type: body.outcome === "success" ? "payment_succeeded" : body.outcome === "failed" ? "payment_failed" : "other",
      reference: body.reference,
      raw: body,
    };
  },

  async createCharityAccount(req) {
    return { accountRef: `test_acct_${req.charityId.slice(0, 8)}` };
  },
};
