"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { quoteDonation, startDonation, type Quote } from "@/lib/donations/checkout";
import { loadDonatableCharity } from "@/lib/donations/charity";
import { checkDonorDetails, checkoutSchema, cleanPhone, type CheckoutInput } from "@/lib/donations/validation";
import { clientIp } from "@/lib/client-ip";
import { getViewer } from "@/lib/auth";
import { formToObject } from "@/lib/form";
import { formatRand, parseRandToCents } from "@/lib/money";
import { platformConfig } from "@/config/platform";

export type QuoteState = { ok: boolean; message?: string; quote?: Quote };

export async function getQuote(slug: string, _prev: QuoteState, formData: FormData): Promise<QuoteState> {
  const charity = await loadDonatableCharity(slug);
  if (!charity?.acceptingPayments) return { ok: false, message: "This charity can't take online donations right now." };
  const typed = String(formData.get("amount") ?? "");
  const cents = parseRandToCents(typed);
  if (cents === null) {
    // SA writes thousands with a space; a comma is the decimal mark, so 1,250 can't be read safely.
    if (/\d,\d{3}\b/.test(typed)) return { ok: false, message: "Use a space or nothing for thousands, for example 1250 or 1 250." };
    return { ok: false, message: "Enter an amount in Rand, for example 180 or 180.50." };
  }
  if (cents === 0) return { ok: false, message: `The minimum donation is ${formatRand(platformConfig.minDonationCents)}.` };
  let contribution = 0;
  if (formData.get("give_extra") === "on") {
    const c = parseRandToCents(String(formData.get("contribution") ?? ""));
    if (c === null) return { ok: false, message: "Enter your contribution in Rand, for example 10 or 25.50." };
    contribution = c;
  }
  const result = quoteDonation(cents, contribution);
  return result.ok ? { ok: true, quote: result.quote } : { ok: false, message: result.message };
}

export type CheckoutState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  quote?: Quote;
  /** The payment never started (offline, or the server failed): the page offers a person to ask. */
  failedToStart?: boolean;
};

export async function submitDonation(
  slug: string,
  giftCents: number,
  contributionCents: number,
  shownTotalCents: number,
  fromApp: boolean,
  campaignId: string | undefined,
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  // Bots fill in every field, including this hidden one.
  if (formData.get("website")) return { ok: false, message: "Something went wrong. Please try again." };

  const raw = formToObject(formData);
  raw.phone = cleanPhone(raw.phone);
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    // Everything to fix in one go, not a round at a time: the other checks run on what was typed too.
    const charity = await loadDonatableCharity(slug);
    for (const [k, v] of Object.entries(checkDonorDetails(raw as CheckoutInput, Boolean(charity?.receiptsAvailable)))) fieldErrors[k] ??= v;
    return { ok: false, message: fixMessage(fieldErrors), fieldErrors };
  }

  const h = await headers();
  const ip = clientIp(h);
  // "Use my ID ending 1234": only for the signed-in person, checked here on the server.
  const viewer = formData.get("use_saved_id") === "on" ? await getViewer() : null;
  const useSavedIdOf = viewer?.email ? { userId: viewer.userId, email: viewer.email } : undefined;
  const result = await startDonation({ charitySlug: slug, giftCents, contributionCents, shownTotalCents, fromApp, campaignId, input: parsed.data, ip, useSavedIdOf });
  if (!result.ok) return result.message === "Please check the highlighted fields." && result.fieldErrors ? { ...result, message: fixMessage(result.fieldErrors) } : result;
  // The website never charges a saved card (only the app does), so there is always a payment page.
  if (!result.redirectUrl) return { ok: false, message: "We couldn't start the payment. Please try again." };
  redirect(result.redirectUrl);
}

/** The line by the Pay button when fields need fixing. */
function fixMessage(fieldErrors: Record<string, string>): string {
  const n = Object.keys(fieldErrors).length;
  return n === 1 ? "Please fix the field marked in red above." : `Please fix the ${n} fields marked in red above.`;
}
