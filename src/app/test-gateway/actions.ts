"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getGateway } from "@/lib/gateway";
import { testGatewaySign } from "@/lib/gateway/test-gateway";

/**
 * The stand-in gateway's "server": sends a signed webhook to our own
 * webhook route, exactly as a real gateway would, then returns the donor.
 */
export async function completeTestPayment(formData: FormData) {
  if (getGateway().name !== "test") throw new Error("Test gateway disabled");
  const reference = String(formData.get("reference"));
  const amount = Number(formData.get("total"));
  const outcome = formData.get("outcome") === "success" ? "success" : "failed";
  const returnUrl = String(formData.get("return"));

  const body = JSON.stringify({ id: randomUUID(), outcome, reference, amount });
  const site = process.env.SITE_URL ?? "http://127.0.0.1:3000";
  const res = await fetch(`${site}/api/webhooks/test`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-signature": testGatewaySign(body) },
    body,
  });
  if (!res.ok) throw new Error(`Webhook failed: ${res.status}`);
  redirect(returnUrl);
}
