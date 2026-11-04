"use server";

import { headers } from "next/headers";
import { getViewer } from "@/lib/auth";
import { clientIp } from "@/lib/client-ip";
import { formToObject } from "@/lib/form";
import { completeS18aDetails, type S18aFormState } from "@/lib/donations/s18a-complete";

/**
 * "Add my details after paying": the thank-you page (holding the credential from the donor's payment link) or the
 * donor's account page (signed in) adds the s18A details to a paid gift. Who may do it is checked on the server.
 */
export async function addS18aDetails(_prev: S18aFormState, formData: FormData): Promise<S18aFormState> {
  const form = formToObject(formData);
  const donationId = form.donation_id ?? "";
  const token = form.t;
  const ip = clientIp(await headers());
  if (token) return completeS18aDetails({ donationId, who: { token }, form, ip });
  const viewer = await getViewer();
  if (!viewer) return { ok: false, message: "Please sign in with the email you gave with, then add your details from your account. Nothing has changed." };
  return completeS18aDetails({ donationId, who: { userId: viewer.userId }, form, ip });
}
