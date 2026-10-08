import "server-only";
import { randomUUID } from "node:crypto";
import { legalConfig } from "@/config/legal";
import { platformConfig } from "@/config/platform";
import { encrypt, last4, receiptIdentity } from "@/lib/crypto";
import { FeeError, priceDonation, type Pricing } from "@/lib/fees";
import { getGateway, GatewayError } from "@/lib/gateway";
import { formatRand } from "@/lib/money";
import { hitRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadDonatableCharity } from "./charity";
import { checkDonorDetails, type CheckoutInput } from "./validation";

export type Quote = Pricing;

export type QuoteResult =
  | { ok: true; quote: Quote }
  | { ok: false; message: string };

const minimums = {
  minDonationCents: platformConfig.minDonationCents,
  minContributionCents: platformConfig.minContributionCents,
};

function feeErrorMessage(e: FeeError): string {
  if (e.code === "below_minimum") return `The minimum donation is ${formatRand(platformConfig.minDonationCents)}.`;
  if (e.code === "contribution_below_minimum") {
    return `The minimum contribution to ${platformConfig.appName} is ${formatRand(platformConfig.minContributionCents)}.`;
  }
  return e.message;
}

/** Work out what the donor will pay: the donation plus any contribution. No fees. */
export function quoteDonation(giftCents: number, contributionCents: number): QuoteResult {
  try {
    return { ok: true, quote: priceDonation(giftCents, contributionCents, minimums) };
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
 * `shownTotalCents` is the total the donor saw: if it no longer matches we
 * stop and show the figures again instead of charging something else.
 */
export async function startDonation(args: {
  charitySlug: string;
  giftCents: number;
  contributionCents: number;
  shownTotalCents: number;
  /** Came from the phone app: the confirmation page then offers a way back. */
  fromApp?: boolean;
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

  const quoted = quoteDonation(args.giftCents, args.contributionCents);
  if (!quoted.ok) return { ok: false, message: quoted.message };
  const fees = quoted.quote;
  if (fees.totalCents !== args.shownTotalCents) {
    return { ok: false, message: `The total is now ${formatRand(fees.totalCents)}. Please confirm again.`, quote: fees };
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
    contribution_cents: fees.contributionCents,
    platform_fee_cents: 0,
    fee_vat_cents: 0,
    processing_charge_cents: 0,
    total_charged_cents: fees.totalCents,
    status: "pending",
    gateway: gateway.name,
    gateway_ref: donationId,
    wants_18a: want18a,
    is_anonymous: v.is_anonymous === "on",
    message: v.message ?? null,
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
          receipt_identity: receiptIdentity({
            donorType: v.donor_type,
            idNumber: v.id_number,
            taxReference: v.tax_reference,
            registrationNumber: v.registration_number,
          }),
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

  // What the donor agreed to, and which version of the Terms and Privacy Policy they saw.
  const consent = await db.from("consents").insert({ kind: "donation", policy_version: legalConfig.policyVersion, donation_id: donationId });
  if (consent.error) throw consent.error;

  // The donor's own choice (maaser, chomesh or general tzedaka). Kept in a table
  // only the donor can read: charities never see it.
  const kind = await db.from("donation_giving_kinds").insert({ donation_id: donationId, kind: v.giving_kind });
  if (kind.error) throw kind.error;

  try {
    const site = process.env.SITE_URL ?? "";
    const { redirectUrl } = await gateway.createCheckout({
      reference: donationId,
      totalCents: fees.totalCents,
      lines: { charityCents: fees.amountCents, contributionCents: fees.contributionCents },
      charityAccountRef: charity.splitAccountRef,
      email: v.email,
      returnUrl: `${site}/donate/return?reference=${donationId}${args.fromApp ? "&from=app" : ""}`,
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
