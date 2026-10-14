"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { quoteDonation, startDonation, type Quote } from "@/lib/donations/checkout";
import { loadDonatableCharity } from "@/lib/donations/charity";
import { checkoutSchema, cleanPhone } from "@/lib/donations/validation";
import { clientIp } from "@/lib/client-ip";
import { formToObject } from "@/lib/form";
import { parseRandToCents } from "@/lib/money";

export type QuoteState = { ok: boolean; message?: string; quote?: Quote };

export async function getQuote(slug: string, _prev: QuoteState, formData: FormData): Promise<QuoteState> {
  const charity = await loadDonatableCharity(slug);
  if (!charity?.acceptingPayments) return { ok: false, message: "This charity can't take online donations right now." };
  const cents = parseRandToCents(String(formData.get("amount") ?? ""));
  if (cents === null) return { ok: false, message: "Enter an amount in Rand, for example 180 or 180.50." };
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
};

export async function submitDonation(
  slug: string,
  giftCents: number,
  contributionCents: number,
  shownTotalCents: number,
  fromApp: boolean,
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
    return { ok: false, message: "Please check the highlighted fields.", fieldErrors };
  }

  const h = await headers();
  const ip = clientIp(h);
  const result = await startDonation({ charitySlug: slug, giftCents, contributionCents, shownTotalCents, fromApp, input: parsed.data, ip });
  if (!result.ok) return result;
  redirect(result.redirectUrl);
}
