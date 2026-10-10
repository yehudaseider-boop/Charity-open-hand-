import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PaymentGateway, VerifiedTransaction, WebhookEvent } from "./types";

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
  /** Behaves like a gateway that cannot split, so that path is the one tested. */
  splitsPayments: false,

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
    const p = data?.payload as { outcome?: string; amount?: number; reference?: string } | undefined;
    return {
      reference,
      status: p?.outcome === "success" ? "success" : p?.outcome === "failed" ? "failed" : "pending",
      amountCents: p?.amount ?? 0,
      currency: "ZAR",
      gatewayTransactionId: `test_${reference}`,
    };
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
