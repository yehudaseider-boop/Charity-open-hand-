"use server";

import { headers } from "next/headers";
import { clientIp } from "@/lib/client-ip";
import { formToObject } from "@/lib/form";
import { requestFreshConfirmationLink, type FreshLinkState } from "@/lib/donations/fresh-link";

/**
 * "Email me a fresh link" on an expired donation link (decided 23/11/2026). Only the gift's reference and the expired
 * credential from the address are sent: never an email address, which is taken from the gift's own record.
 */
export async function emailFreshLink(_prev: FreshLinkState, formData: FormData): Promise<FreshLinkState> {
  const form = formToObject(formData);
  return requestFreshConfirmationLink({ donationId: form.reference ?? "", token: form.t, ip: clientIp(await headers()) });
}
