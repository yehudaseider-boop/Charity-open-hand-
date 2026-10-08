import "server-only";
import { randomUUID } from "node:crypto";
import { platformConfig } from "@/config/platform";
import { encrypt, last4 } from "@/lib/crypto";
import { calculateFees, FeeError, type FeeBreakdown } from "@/lib/fees";
import { getGateway, GatewayError } from "@/lib/gateway";
import { formatRand } from "@/lib/money";
import { hitRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadDonatableCharity } from "./charity";
import { loadFeeSettings } from "./fee-settings";
import { checkDonorDetails, type CheckoutInput } from "./validation";

export type Quote = FeeBreakdown;

export type QuoteResult =
  | { ok: true; quote: Quote }
  | { ok: false; message: string };

function feeErrorMessage(e: FeeError): string {
  if (e.code === "below_minimum") return `The minimum gift is ${formatRand(platformConfig.minDonationCents)}.`;
  if (e.code === "rates_missing") return "Online giving isn't open yet. Please check back soon.";
  return e.message;
}

/** Work out what the donor will pay. Server-side only; the browser never calculates fees. */
export async function quoteDonation(charityId: string, giftCents: number): Promise<QuoteResult> {
  const { settings } = await loadFeeSettings(charityId);
  try {
    return { ok: true, quote: calculateFees(giftCents, settings) };
  } catch (e) {
    if (e instanceof FeeError) return { ok: false, message: feeErrorMessage(e) };
    throw e;
  }
}

export type StartResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string>; quote?: Quote };

/**
 * Record a pending donation and hand the donor to the gateway.
 * `shownTotalCents` is the total the donor saw: if fees changed in the
 * meantime we stop and show the new figures instead of charging something else.
 */
export async function startDonation(args: {
  charitySlug: string;
  giftCents: number;
  shownTotalCents: number;
  input: CheckoutInput;
  ip: string;
}): Promise<StartResult> {
  const charity = await loadDonatableCharity(args.charitySlug);
  if (!charity || !charity.acceptingPayments) {
    return { ok: false, message: "This charity can't take online donations right now." };
  }

  const fieldErrors = checkDonorDetails(args.input, charity.receiptsAvailable);
  if (Object.keys(fieldErrors).length) return { ok: false, message: "Please check the highlighted fields.", fieldErrors };

  const limited = await hitRateLimit("checkout", [`ip:${args.ip}`, `email:${args.input.email.toLowerCase()}`], 5, 10);
  if (limited) return { ok: false, message: "Too many attempts. Please wait 10 minutes and try again." };

  const { id: feeSettingsId, settings } = await loadFeeSettings(charity.id);
  let fees: FeeBreakdown;
  try {
    fees = calculateFees(args.giftCents, settings);
  } catch (e) {
    if (e instanceof FeeError) return { ok: false, message: feeErrorMessage(e) };
    throw e;
  }
  if (fees.totalCents !== args.shownTotalCents) {
    return {
      ok: false,
      message: `The processing fee has changed. The new total is ${formatRand(fees.totalCents)}. Please confirm again.`,
      quote: fees,
    };
  }

  const v = args.input;
  const want18a = charity.receiptsAvailable && v.wants_18a === "on";
  const db = createAdminClient();
  const donorId = await findOrCreateDonor(v, want18a);
  const now = new Date().toISOString();
  const donationId = randomUUID();
  const gateway = getGateway();

  const { error } = await db.from("donations").insert({
    id: donationId,
    donor_id: donorId,
    charity_id: charity.id,
    amount_cents: fees.amountCents,
    platform_fee_cents: fees.platformFeeCents,
    fee_vat_cents: fees.feeVatCents,
    processing_charge_cents: fees.processingChargeCents,
    total_charged_cents: fees.totalCents,
    fee_settings_id: feeSettingsId,
    status: "pending",
    gateway: gateway.name,
    gateway_ref: donationId,
    wants_18a: want18a,
    is_anonymous: v.is_anonymous === "on",
    message: v.message ?? null,
    giving_kind: v.giving_kind,
    popia_consent_at: now,
    age_confirmed_at: now,
  });
  if (error) throw error;

  const details = await db.from("donation_checkout_details").insert({
    donation_id: donationId,
    donor_type: v.donor_type,
    email: v.email,
    first_name: v.first_name ?? null,
    last_name: v.last_name ?? null,
    organisation_name: v.organisation_name ?? null,
    registration_number: v.registration_number ?? null,
    contact_person: v.contact_person ?? null,
    phone: v.phone ?? null,
    ...(want18a
      ? {
          id_number_encrypted: v.id_number ? encrypt(v.id_number.replace(/\s/g, "")) : null,
          id_number_last4: v.id_number ? last4(v.id_number) : null,
          tax_reference_encrypted: v.tax_reference ? encrypt(v.tax_reference) : null,
          tax_reference_last4: v.tax_reference ? last4(v.tax_reference) : null,
          address_line1: v.address_line1 ?? null,
          address_line2: v.address_line2 ?? null,
          suburb: v.suburb ?? null,
          city: v.city ?? null,
          postal_code: v.postal_code ?? null,
        }
      : {}),
  });
  if (details.error) throw details.error;

  try {
    const site = process.env.SITE_URL ?? "";
    const { redirectUrl } = await gateway.createCheckout({
      reference: donationId,
      totalCents: fees.totalCents,
      charityShareCents: fees.amountCents,
      charityAccountRef: charity.gateway_subaccount_ref!,
      email: v.email,
      returnUrl: `${site}/donate/return?reference=${donationId}`,
      description: `Donation to ${charity.name_en}`,
    });
    return { ok: true, redirectUrl };
  } catch (e) {
    await db.from("donations").update({ status: "failed", failed_at: new Date().toISOString() }).eq("id", donationId);
    if (e instanceof GatewayError) {
      console.error(e);
      return { ok: false, message: "We couldn't reach the payment provider. Please try again in a minute." };
    }
    throw e;
  }
}

/**
 * One donor identity per email + type (+ registration number).
 * An existing identity is never overwritten from a guest checkout (anyone can
 * type any email); only empty fields are filled. The details exactly as typed
 * are kept with the donation itself.
 */
async function findOrCreateDonor(v: CheckoutInput, want18a: boolean): Promise<string> {
  const db = createAdminClient();
  const reg = v.donor_type === "individual" ? null : (v.registration_number ?? null);
  const now = new Date().toISOString();
  const fields = {
    first_name: v.first_name ?? null,
    last_name: v.last_name ?? null,
    organisation_name: v.organisation_name ?? null,
    contact_person: v.contact_person ?? null,
    phone: v.phone ?? null,
    ...(want18a
      ? {
          id_number_encrypted: v.id_number ? encrypt(v.id_number.replace(/\s/g, "")) : null,
          id_number_last4: v.id_number ? last4(v.id_number) : null,
          tax_reference_encrypted: v.tax_reference ? encrypt(v.tax_reference) : null,
          tax_reference_last4: v.tax_reference ? last4(v.tax_reference) : null,
          address_line1: v.address_line1 ?? null,
          address_line2: v.address_line2 ?? null,
          suburb: v.suburb ?? null,
          city: v.city ?? null,
          postal_code: v.postal_code ?? null,
        }
      : {}),
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    let q = db.from("donors").select("*").eq("email", v.email).eq("donor_type", v.donor_type);
    if (reg) q = q.eq("registration_number", reg);
    else if (v.donor_type === "individual") q = q.is("registration_number", null);
    const { data: matches } = await q.limit(2);
    // A company giving without its registration number joins its existing
    // record for this email, when there is exactly one.
    const existing = matches?.length === 1 ? matches[0] : (matches ?? []).find((m) => m.registration_number === reg);

    if (existing) {
      const blanks: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(fields)) {
        if (val !== null && (existing as Record<string, unknown>)[k] == null) blanks[k] = val;
      }
      if (Object.keys(blanks).length) await db.from("donors").update(blanks).eq("id", existing.id);
      return existing.id;
    }

    const { data, error } = await db
      .from("donors")
      .insert({
        email: v.email,
        donor_type: v.donor_type,
        registration_number: reg,
        age_confirmed_18_at: now,
        popia_consent_at: now,
        ...fields,
      })
      .select("id")
      .single();
    if (data) return data.id;
    if (error?.code !== "23505") throw error; // someone else created it a moment ago: look again
  }
  throw new Error("Could not create donor");
}
