"use server";

import { headers } from "next/headers";
import { getViewer } from "@/lib/auth";
import { saveCharityRequest } from "@/lib/charity-requests-store";
import { clientIp } from "@/lib/client-ip";
import type { FormState } from "@/lib/form";
import { verifyBotCheck } from "@/lib/bot-check";
import { botCheckConfig } from "@/config/bot-check";
import { botCheckRefusedMessage } from "@/lib/bot-check-words";

export type RequestFormState = FormState & { existing?: { name: string; slug: string } };

/** "Request a charity" on the website (15/11/2026). A signed-in donor's request is kept with their account. */
export async function requestCharity(_prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  const ip = clientIp(await headers());
  // Cloudflare's bot check (23/11/2026), when it is on. Fails open if Cloudflare can't be reached (logged): this sends
  // no email when asked, and keeps its hidden field and its limit per address and email.
  const human = await verifyBotCheck({ token: formData.get(botCheckConfig.field), action: "charity-request", ip });
  if (!human.ok) return { ok: false, message: botCheckRefusedMessage("charity-request", "Send request") };
  const viewer = await getViewer().catch(() => null);
  const answer = await saveCharityRequest(
    {
      name: formData.get("name"),
      town: formData.get("town"),
      link: formData.get("link"),
      note: formData.get("note"),
      emailMe: formData.get("email_me"),
      email: formData.get("email"),
      website: formData.get("website"),
    },
    { cameFrom: "website", userId: viewer?.userId ?? null, ip },
  );
  if (answer.ok) return { ok: true, message: answer.message, existing: answer.existing };
  return { ok: false, message: answer.message, fieldErrors: answer.fieldErrors };
}
