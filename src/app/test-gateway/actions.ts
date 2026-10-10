"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getGateway } from "@/lib/gateway";
import { readSignedTestCheckout, testGatewaySign } from "@/lib/gateway/test-gateway";

/**
 * The stand-in gateway's "server": sends a signed webhook to our own
 * webhook route, exactly as a real gateway would, then returns the donor.
 */
export async function completeTestPayment(formData: FormData) {
  if (getGateway().name !== "test") throw new Error("Test gateway disabled");
  // Only act on the exact checkout we signed: the reference, amount and
  // return address can't be swapped for someone else's or an outside site.
  const signed = readSignedTestCheckout((k) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : "";
  }, formData.get("sig"));
  if (!signed) throw new Error("Test checkout signature is invalid");
  const reference = signed.get("reference") ?? "";
  const amount = Number(signed.get("total"));
  const outcome = formData.get("outcome") === "success" ? "success" : "failed";
  const returnUrl = sameSiteReturn(signed.get("return") ?? "");

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

/** The return address, only if it is on this site; otherwise the home page. */
function sameSiteReturn(url: string): string {
  const site = process.env.SITE_URL ?? "";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  if (site && (url === site || url.startsWith(`${site}/`))) return url;
  return "/";
}
