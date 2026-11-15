"use server";

import { headers } from "next/headers";
import { getViewer } from "@/lib/auth";
import { saveCharityRequest } from "@/lib/charity-requests-store";
import { clientIp } from "@/lib/client-ip";
import type { FormState } from "@/lib/form";

export type RequestFormState = FormState & { existing?: { name: string; slug: string } };

/** "Request a charity" on the website (15/11/2026). A signed-in donor's request is kept with their account. */
export async function requestCharity(_prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
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
    { cameFrom: "website", userId: viewer?.userId ?? null, ip: clientIp(await headers()) },
  );
  if (answer.ok) return { ok: true, message: answer.message, existing: answer.existing };
  return { ok: false, message: answer.message, fieldErrors: answer.fieldErrors };
}
