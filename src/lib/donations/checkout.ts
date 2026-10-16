import "server-only";
import { randomUUID } from "node:crypto";
import { legalConfig } from "@/config/legal";
import { platformConfig } from "@/config/platform";
import { encrypt, last4, receiptIdentity } from "@/lib/crypto";
import { FeeError, priceDonation, type Pricing } from "@/lib/fees";
import { getGateway, GatewayError, isGatewayRefusal } from "@/lib/gateway";
import { formatRand } from "@/lib/money";
import { savedAddress, savedIdNumber } from "./saved-id";
import { savedCardsOpen } from "./app-api";
import { loadSavedCardToken, requestCardSave } from "./saved-card";
import { hitRateLimit } from "@/lib/rate-limit";
import { linkDonorsToUser } from "@/lib/donors/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadDonatableCharity } from "./charity";
import { issueConfirmationToken, reissueConfirmationToken } from "./confirmation-access";
import { chargeDayOf } from "./schedule";
import { checkDonorDetails, givingLabelOf, type CheckoutInput } from "./validation";
import { isUuid } from "@/lib/ids";
import { parseDedication } from "./dedication";

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
  /** `reference` and `token` let the phone app ask whether this payment went through (api/app/status). */
  | { ok: true; redirectUrl: string; charged?: undefined; reference: string; token: string }
  /**
   * Paid with the donor's saved card: there is no payment page. The charge is only a first indication;
   * the app asks api/app/status, which checks with the payment provider before anything counts as paid.
   */
  | { ok: true; charged: true; redirectUrl?: undefined; reference: string; token: string }
  /** `savedCardDeclined`: the provider refused the saved card, so the app should offer the payment page with another card. */
  | { ok: false; message: string; fieldErrors?: Record<string, string>; quote?: Quote; savedCardDeclined?: boolean };

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
  /** Given to one of this charity's active campaigns (once-off gifts only). */
  campaignId?: string;
  input: CheckoutInput;
  ip: string;
  /**
   * The donor ticked "use my ID ending 1234": the signed-in account (checked by the caller) whose
   * last s18A gift holds the number. Used only with that account's own email address.
   */
  useSavedIdOf?: { userId: string; email: string };
  /**
   * Once-off gift: keep the card used, for next time. The signed-in account (checked by the caller) that
   * will own the card. Only when saved cards are switched on, and only with that account's own email address.
   */
  saveCardFor?: { userId: string; email: string };
  /** Once-off gift: charge the account's saved card instead of sending the donor to the payment page. Same rules. */
  useSavedCardOf?: { userId: string; email: string };
  /**
   * With a saved card: one id per give attempt, made by the app. Asking again with the same id (a lost
   * answer, a second tap) returns the first answer instead of charging the card a second time.
   */
  attemptId?: string;
}): Promise<StartResult> {
  const charity = await loadDonatableCharity(args.charitySlug);
  if (!charity || !charity.acceptingPayments) {
    return { ok: false, message: "This charity can't take online donations right now." };
  }

  let input = args.input;
  const saved = args.useSavedIdOf;
  if (saved && input.wants_18a === "on" && input.donor_type === "individual" && !input.id_number && !input.tax_reference) {
    const mismatch = "Your saved ID number goes with your account's email address. Use that email, or type the number.";
    if (saved.email.trim().toLowerCase() !== input.email.trim().toLowerCase()) return { ok: false, message: mismatch, fieldErrors: { id_number: mismatch } };
    const id = await savedIdNumber(saved.userId);
    if (!id) return { ok: false, message: "Please check the highlighted fields.", fieldErrors: { id_number: "Enter your SA ID number" } };
    input = { ...input, id_number: id };
    // The address from the same earlier s18A gift, when none is typed this time.
    if (!input.address_line1 && !input.city && !input.postal_code) {
      const address = await savedAddress(saved.userId);
      if (address) input = { ...input, ...Object.fromEntries(Object.entries(address).map(([k, v]) => [k, v ?? undefined])) };
    }
  }

  const fieldErrors = checkDonorDetails(input, charity.receiptsAvailable);
  if (Object.keys(fieldErrors).length) return { ok: false, message: "Please check the highlighted fields.", fieldErrors };

  // Saved cards: once-off gifts only, signed-in account only, and only the account's own email.
  const cardAccount = args.saveCardFor ?? args.useSavedCardOf;
  let savedToken: { code: string; gateway: string } | null = null;
  if (cardAccount) {
    if (!savedCardsOpen()) return { ok: false, message: "Saving a card isn't switched on yet. Please pay on the payment page." };
    if (args.saveCardFor && args.useSavedCardOf) return { ok: false, message: "Choose either a new card or your saved card." };
    if (input.monthly === "on") return { ok: false, message: "Monthly gifts are set up on the payment page. Switch off saved cards for this gift." };
    if (cardAccount.email.trim().toLowerCase() !== input.email.trim().toLowerCase()) {
      return { ok: false, message: "Your card goes with your account's email address. Give with that email, or use the payment page.", fieldErrors: { email: "Use your account's email address" } };
    }
    if (args.useSavedCardOf) {
      savedToken = await loadSavedCardToken(args.useSavedCardOf.userId);
      if (!savedToken || savedToken.gateway !== getGateway().name) {
        return { ok: false, message: "We couldn't find your saved card. Please pay on the payment page." };
      }
    }
  }

  const campaign = args.campaignId ? await loadOpenCampaign(args.campaignId, charity.id) : null;
  if (args.campaignId && !campaign) return { ok: false, message: "This campaign has ended. You can still give to the charity." };
  if (campaign && input.monthly === "on") return { ok: false, message: "Campaign gifts are once-off. Switch off monthly giving, or give monthly to the charity itself." };

  const quoted = quoteDonation(args.giftCents, args.contributionCents);
  if (!quoted.ok) return { ok: false, message: quoted.message };
  const fees = quoted.quote;
  if (fees.totalCents !== args.shownTotalCents) {
    return { ok: false, message: `The total is now ${formatRand(fees.totalCents)}. Please confirm again.`, quote: fees };
  }

  // Only attempts that would reach the payment page count. One email gets 5 tries in 10 minutes;
  // one address gets more, because a shul's Wi-Fi or a mobile network puts many donors behind it.
  const limited =
    (await hitRateLimit("checkout", [`email:${input.email.toLowerCase()}`], 5, 10)) ||
    (await hitRateLimit("checkout-ip", [`ip:${args.ip}`], 30, 10));
  if (limited) return { ok: false, message: "Too many attempts. Please wait 10 minutes and try again." };

  const v = input;
  const want18a = charity.receiptsAvailable && v.wants_18a === "on";
  // Already checked in checkDonorDetails, so here it is a dedication or none.
  const parsedDedication = parseDedication(v.dedication_kind, v.dedication_name);
  const dedication = parsedDedication && !("error" in parsedDedication) ? parsedDedication : null;
  const db = createAdminClient();
  const attemptId = savedToken && args.attemptId && isUuid(args.attemptId) ? args.attemptId : null;
  if (attemptId) {
    const { data: prior, error: priorError } = await db
      .from("donations")
      .select("status, charity_id, total_charged_cents, donation_checkout_details(email)")
      .eq("id", attemptId)
      .maybeSingle();
    if (priorError) throw priorError;
    if (prior) {
      const details = prior.donation_checkout_details as { email: string | null } | { email: string | null }[] | null;
      const priorEmail = (Array.isArray(details) ? details[0]?.email : details?.email) ?? "";
      if (prior.charity_id !== charity.id || priorEmail.toLowerCase() !== v.email.toLowerCase() || Number(prior.total_charged_cents) !== fees.totalCents) {
        return { ok: false, message: "Something went wrong. Please close this screen and try again." };
      }
      if (prior.status === "failed") {
        return { ok: false, savedCardDeclined: true, message: "Your saved card was declined. Please pay on the payment page with a different card." };
      }
      return { ok: true, charged: true, reference: attemptId, token: await reissueConfirmationToken(attemptId) };
    }
  }
  const donorId = await findOrCreateDonor(v, want18a);
  // Signed in with this same (confirmed) email: the donation joins their account now,
  // not at their next sign-in. Never for a different address.
  try {
    const { data } = await (await createClient()).auth.getUser();
    const user = data.user;
    if (user?.email && user.email_confirmed_at && user.email.toLowerCase() === v.email.toLowerCase()) {
      await linkDonorsToUser(user.id, user.email);
    }
  } catch (e) {
    console.error(e);
  }
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const donationId = attemptId ?? randomUUID();
  const gateway = getGateway();

  // A monthly donation: the first payment below is month one. The monthly record waits
  // ("pending") until that payment is confirmed and the card can be charged again.
  const monthly = v.monthly === "on";
  const recurringId = monthly ? randomUUID() : null;
  if (recurringId) {
    const r = await db.from("recurring_donations").insert({
      id: recurringId,
      donor_id: donorId,
      charity_id: charity.id,
      amount_cents: fees.amountCents,
      contribution_cents: fees.contributionCents,
      status: "pending",
      wants_18a: want18a,
      is_anonymous: v.is_anonymous === "on",
      message: v.message ?? null,
      // Only when there is one, so taking a donation keeps working even if this code goes live before the dedications database change (other screens do need it: run the database change first).
      ...(dedication ? { dedication_kind: dedication.kind, dedication_name: dedication.name } : {}),
      gateway: gateway.name,
      charge_day: chargeDayOf(nowDate),
    });
    if (r.error) throw r.error;
  }

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
    recurring_id: recurringId,
    ...(campaign ? { campaign_id: campaign.id } : {}),
    wants_18a: want18a,
    is_anonymous: v.is_anonymous === "on",
    message: v.message ?? null,
    // Only when there is one, so taking a donation keeps working even if this code goes live before the dedications database change (other screens do need it: run the database change first).
    ...(dedication ? { dedication_kind: dedication.kind, dedication_name: dedication.name } : {}),
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
  if (recurringId) {
    // What the donor authorised: the same amount every month until they cancel.
    const link = await db.from("recurring_donations").update({ first_donation_id: donationId }).eq("id", recurringId);
    if (link.error) throw link.error;
    const auth = await db.from("consents").insert({ kind: "monthly_authorisation", policy_version: legalConfig.policyVersion, donation_id: donationId });
    if (auth.error) throw auth.error;
  }

  if (args.saveCardFor) {
    // The donor ticked "Save my card": what they agreed to, and the card is kept once this payment is confirmed.
    const keep = await db.from("consents").insert({ kind: "saved_card", policy_version: legalConfig.policyVersion, donation_id: donationId });
    if (keep.error) throw keep.error;
    await requestCardSave(donationId, args.saveCardFor.userId);
  }

  // The donor's own label for the gift, if they gave one. Kept in a table only the donor
  // can read: charities never see it.
  const label = givingLabelOf(v);
  if (label) {
    const kept = await db.from("donation_giving_kinds").insert({ donation_id: donationId, label });
    if (kept.error) throw kept.error;
  }

  // Sent only to the donor, in the address the gateway returns them to.
  const confirmationToken = await issueConfirmationToken(donationId);

  if (savedToken) {
    // Their saved card: no payment page. A refusal (declined, expired) ends this gift; anything else
    // (a timeout, an outage) leaves it pending, because the charge may have gone through and a second
    // charge must never follow. Either way the answer only counts once confirmed with the provider.
    const failGift = async () => {
      await db.from("donations").update({ status: "failed", failed_at: new Date().toISOString() }).eq("id", donationId).eq("status", "pending");
      return { ok: false as const, savedCardDeclined: true, message: "Your saved card was declined. Please pay on the payment page with a different card." };
    };
    try {
      const { status } = await gateway.chargeAuthorization({
        reference: donationId,
        authorizationCode: savedToken.code,
        email: v.email,
        totalCents: fees.totalCents,
        lines: { charityCents: fees.amountCents, contributionCents: fees.contributionCents },
        charityAccountRef: charity.splitAccountRef,
        feeBearer: platformConfig.fees.gatewayChargePaidBy,
        description: `Donation to ${charity.name_en}`,
        monthly: false,
      });
      if (status === "failed") return await failGift();
    } catch (e) {
      if (isGatewayRefusal(e)) return await failGift();
      console.error(e);
    }
    return { ok: true, charged: true, reference: donationId, token: confirmationToken };
  }

  try {
    const site = process.env.SITE_URL ?? "";
    const { redirectUrl } = await gateway.createCheckout({
      reference: donationId,
      totalCents: fees.totalCents,
      lines: { charityCents: fees.amountCents, contributionCents: fees.contributionCents },
      charityAccountRef: charity.splitAccountRef,
      feeBearer: platformConfig.fees.gatewayChargePaidBy,
      email: v.email,
      saveCard: monthly || Boolean(args.saveCardFor),
      returnUrl: `${site}/donate/return?reference=${donationId}&t=${confirmationToken}${args.fromApp ? "&from=app" : ""}`,
      description: `Donation to ${charity.name_en}`,
    });
    return { ok: true, redirectUrl, reference: donationId, token: confirmationToken };
  } catch (e) {
    await db.from("donations").update({ status: "failed", failed_at: new Date().toISOString() }).eq("id", donationId);
    if (recurringId) {
      await db.from("recurring_donations").update({ status: "cancelled", cancelled_at: new Date().toISOString(), ended_reason: "the first payment could not be started" }).eq("id", recurringId);
    }
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
  // The full ID and tax numbers stay only with each donation's checkout details (for its receipt), never on the
  // donor record: that record can be shared by everyone who gives with one email address.
  const fields = {
    first_name: v.first_name ?? null,
    last_name: v.last_name ?? null,
    organisation_name: v.organisation_name ?? null,
    contact_person: v.contact_person ?? null,
    phone: v.phone ?? null,
    ...(want18a
      ? {
          id_number_last4: v.id_number ? last4(v.id_number) : null,
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

/** One of this charity's campaigns that is taking gifts now (active and not past its end), or null. */
export async function loadOpenCampaign(id: string, charityId: string): Promise<{ id: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createAdminClient()
    .from("campaigns")
    .select("id, ends_at")
    .eq("id", id)
    .eq("charity_id", charityId)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return null;
  if (data.ends_at && new Date(data.ends_at).getTime() < Date.now()) return null;
  return { id: data.id };
}
