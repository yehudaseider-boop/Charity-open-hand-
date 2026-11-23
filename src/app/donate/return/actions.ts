"use server";

import { headers } from "next/headers";
import { clientIp } from "@/lib/client-ip";
import { formToObject } from "@/lib/form";
import { requestFreshConfirmationLink, type FreshLinkState } from "@/lib/donations/fresh-link";
import { verifyBotCheck } from "@/lib/bot-check";
import { botCheckConfig } from "@/config/bot-check";
import { botCheckRefusedMessage, botCheckUnreachableMessage } from "@/lib/bot-check-words";

/**
 * "Email me a fresh link" on an expired donation link (decided 23/11/2026). Only the gift's reference and the expired
 * credential from the address are sent: never an email address, which is taken from the gift's own record.
 */
export async function emailFreshLink(_prev: FreshLinkState, formData: FormData): Promise<FreshLinkState> {
  const ip = clientIp(await headers());
  // Cloudflare's bot check (23/11/2026), when it is on, before any limit is counted. Fails closed: if Cloudflare can't
  // be reached, nothing is sent and the donor is asked to try again in a minute.
  const human = await verifyBotCheck({ token: formData.get(botCheckConfig.field), action: "fresh-link", ip });
  if (!human.ok) return { ok: false, message: human.reason === "unreachable" ? botCheckUnreachableMessage() : botCheckRefusedMessage("fresh-link", "Email me a fresh link") };
  const form = formToObject(formData);
  return requestFreshConfirmationLink({ donationId: form.reference ?? "", token: form.t, ip });
}
