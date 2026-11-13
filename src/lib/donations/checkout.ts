import "server-only";
import { randomUUID } from "node:crypto";
import { legalConfig } from "@/config/legal";
import { platformConfig } from "@/config/platform";
import { encrypt, last4, receiptIdentity } from "@/lib/crypto";
import { getGateway, GatewayError, isGatewayRefusal } from "@/lib/gateway";
import { savedAddress, savedIdNumber } from "./saved-id";
import { savedCardsOpen } from "./app-api";
import { loadSavedCardToken, requestCardSave } from "./saved-card";
import { checkGivingAllowed, rememberGiftStart } from "./giving-guard";
import { linkDonorsToUser } from "@/lib/donors/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadDonatableCharity } from "./charity";
import { checkShownTotal, type Quote } from "./quote";
import { issueConfirmationToken, reissueConfirmationToken } from "./confirmation-access";
import { chargeDayOf } from "./schedule";
import { cameFromOf } from "./source";
import { optOutAtCheckout } from "@/lib/charity/appeals";
import { checkDonorDetails, givingLabelOf, s18aDetailsLater, type CheckoutInput } from "./validation";
import { isUuid } from "@/lib/ids";
import { parseDedication } from "./dedication";

// The pricing itself is shared with the give form's live total (quote.ts), so both always agree.
export { quoteDonation, type Quote, type QuoteResult } from "./quote";

export type StartResult =
  /** `reference` and `token` let the phone app ask whether this payment went through (api/app/status). */
  | { ok: true; redirectUrl: string; charged?: undefined; reference: string; token: string }
  /**
   * Paid with the donor's saved card: there is no payment page. The charge is only a first indication;
   * the app asks api/app/status, which checks with the payment provider before anything counts as paid.
   */
  | { ok: true; charged: true; redirectUrl?: undefined; reference: string; token: string }
  /** `savedCardDeclined`: the provider refused the saved card, so the app should offer the payment page with another card. */
  | { ok: false; message: string; fieldErrors?: Record<string, string>; quote?: Quote; savedCardDeclined?: boolean; attemptMismatch?: boolean; providerDown?: boolean; campaignEnded?: boolean; limited?: boolean };

/**
 * Record a pending donation and hand the donor to the gateway.
 * `shownTotalCents` is the total the donor saw: if it no longer matches we
 * stop and show the figures again instead of charging something else.
 */
export async function startDonation(args: {
  charitySlug: string;
  giftCents: number;
  contributionCents: number;
  /** The donor ticked "cover the card charge". Ignored while the provider's rates are unknown (the box doesn't show then). */
  coverCardCharge?: boolean;
  shownTotalCents: number;
  /** Came from the phone app: the confirmation page then offers a way back. */
  fromApp?: boolean;
  /** Given to one of this charity's active campaigns (once-off gifts only). */
  campaignId?: string;
  /** The `?src=` tag of the link the donor followed (whatsapp, link, qr); anything else counts as the website. */
  sourceTag?: string | null;
  input: CheckoutInput;
  ip: string;
  /**
   * Who is signed in (checked by the caller: the website's session, or the app's token), whether or not they use
   * anything saved. When it is the same email as the gift, the gift is marked as started by that account, so only
   * then can it later give "Use my ID ending 1234", and only then may it fill in that account's donor details.
   */
  signedInAs?: { userId: string; email: string };
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
  if (saved && input.wants_18a === "on" && input.s18a_when !== "later" && input.donor_type === "individual" && !input.id_number) {
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
  if (args.campaignId && !campaign) return { ok: false, message: "This campaign has ended. You can still give to the charity.", campaignEnded: true };
  if (campaign && input.monthly === "on") return { ok: false, message: "Campaign gifts are once-off. Switch off monthly giving, or give monthly to the charity itself." };

  // Never charge a total the donor did not see: stop, say so plainly, and show the new figures (the form keeps everything typed).
  const checked = checkShownTotal(args.giftCents, args.contributionCents, Boolean(args.coverCardCharge), args.shownTotalCents);
  if (!checked.ok) return checked.quote ? { ok: false, message: checked.message, quote: checked.quote } : { ok: false, message: checked.message };
  const fees = checked.quote;


  const v = input;
  const want18a = charity.receiptsAvailable && v.wants_18a === "on";
  // "Add my details after paying": an s18A gift whose ID or registration number and address come later (thank-you
  // page or account). Nothing of them is kept from this form, so the receipt waits for the donor's own entry.
  const detailsNow = want18a && !s18aDetailsLater(v, charity.receiptsAvailable);
  // Already checked in checkDonorDetails, so here it is a dedication or none.
  const parsedDedication = parseDedication(v.dedication_kind, v.dedication_name);
  const dedication = parsedDedication && !("error" in parsedDedication) ? parsedDedication : null;
  const db = createAdminClient();
  // A saved-card charge has no payment page to stop a double tap, so it must carry the app's attempt id:
  // the same id is the same charge, never a second one. Without one, nothing is charged.
  if (savedToken && !(args.attemptId && isUuid(args.attemptId))) {
    return { ok: false, message: "Something went wrong, so nothing was charged. Please close this screen and try again." };
  }
  const attemptId = savedToken && args.attemptId && isUuid(args.attemptId) ? args.attemptId : null;
  if (attemptId) {
    const { data: prior, error: priorError } = await db
      .from("donations")
      .select("status, charity_id, total_charged_cents, created_at, donation_checkout_details(email)")
      .eq("id", attemptId)
      .maybeSingle();
    if (priorError) throw priorError;
    if (prior) {
      const details = prior.donation_checkout_details as { email: string | null } | { email: string | null }[] | null;
      const priorEmail = (Array.isArray(details) ? details[0]?.email : details?.email) ?? "";
      if (prior.charity_id !== charity.id || priorEmail.toLowerCase() !== v.email.toLowerCase() || Number(prior.total_charged_cents) !== fees.totalCents) {
        // The same attempt with different details: the app keeps the attempt id, so a changed
        // amount can never become a second charge on this screen.
        return { ok: false, attemptMismatch: true, message: "Something went wrong. Please close this screen and try again." };
      }
      if (prior.status === "failed") {
        return { ok: false, savedCardDeclined: true, message: "Your saved card was declined. Please pay on the payment page with a different card." };
      }
      if (prior.status === "pending") {
        // The first try may have stopped after recording the gift but before the charge was sent (a lost
        // insert, a crash). Ask the provider: only a reference it has never seen is charged now, under the
        // same reference, so the provider itself refuses a second charge if the first one did go out.
        const reached = await providerKnows(attemptId);
        if (reached === "unknown") {
          return { ok: false, message: "We couldn't check this gift with the payment provider. Please wait a minute and try again. Your card won't be charged twice." };
        }
        if (reached === "no" && savedToken) {
          const startedAt = new Date(String(prior.created_at ?? "")).getTime();
          // A first try still on its way to the provider: never race it.
          if (!Number.isFinite(startedAt) || Date.now() - startedAt < RESUME_AFTER_MS) {
            return { ok: false, message: "We're still sending this gift to the payment provider. Please wait a minute and try again. Your card won't be charged twice." };
          }
          await finishSavedCardRecords(attemptId, v);
          return chargeSavedCard({ donationId: attemptId, savedToken, v, fees, charity, token: await reissueConfirmationToken(attemptId), resumed: true });
        }
        if (reached === "failed") {
          // The first try's charge did reach the provider and was declined: say so, as the first try would have.
          await db.from("donations").update({ status: "failed", failed_at: new Date().toISOString() }).eq("id", attemptId).eq("status", "pending");
          return { ok: false, savedCardDeclined: true, message: "Your saved card was declined. Please pay on the payment page with a different card." };
        }
      }
      return { ok: true, charged: true, reference: attemptId, token: await reissueConfirmationToken(attemptId) };
    }
  }
  // Card-testing protection: only new attempts that would reach the payment page count (limits per email and per
  // address, a wait after several declined cards). Asking again about an attempt already recorded (above) is never
  // refused: that gift may already be charged. See giving-guard.ts; the values are in platformConfig.givingGuard.
  const refused = await checkGivingAllowed({ email: v.email, ip: args.ip, charityId: charity.id });
  if (refused) return { ok: false, message: refused.message, limited: true };
  // The account that started this gift: one signed in with this same email (checked by the caller), else none.
  // Guest gifts and gifts given with another email are never a source for that account's saved ID or address.
  const sameEmail = (a?: { email: string }) => Boolean(a?.email) && a!.email.trim().toLowerCase() === v.email.trim().toLowerCase();
  const startedBy = [args.signedInAs, args.useSavedIdOf, args.saveCardFor, args.useSavedCardOf].find(sameEmail)?.userId ?? null;
  const donorId = await findOrCreateDonor(v, detailsNow, startedBy);
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
      // Each month's collection covers the card charge too, worked out from the rates of the day.
      ...(fees.cardChargeCents > 0 ? { covers_card_charge: true } : {}),
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

  // Nothing below can have charged anyone: the card is only entered on the payment page, or charged after this.
  // If something fails before then, the gift and its monthly record are closed at once (13/11/2026), so they never
  // sit "pending" (a monthly one was never closed at all). Not for a saved-card attempt: the app asks about it again
  // under the same id, and "failed" would read as a declined card.
  const closeUnstarted = async () => {
    const at = new Date().toISOString();
    const results = await Promise.all([
      db.from("donations").update({ status: "failed", failed_at: at }).eq("id", donationId).eq("status", "pending"),
      recurringId
        ? db.from("recurring_donations").update({ status: "cancelled", cancelled_at: at, ended_reason: "the first payment could not be started" }).eq("id", recurringId).eq("status", "pending")
        : null,
    ]).catch((e: unknown) => [{ error: e }]);
    for (const r of results) if (r?.error) console.error("[checkout] could not close a gift that never started; the daily check closes it later", r.error);
  };

  let confirmationToken: string;
  try {
    // Said no to news and appeals: kept before anything else, so it holds even if the payment never happens.
    if (v.no_news === "on") await optOutAtCheckout(charity.id, v.email);

    const { error } = await db.from("donations").insert({
      id: donationId,
      donor_id: donorId,
      charity_id: charity.id,
      amount_cents: fees.amountCents,
      contribution_cents: fees.contributionCents,
      platform_fee_cents: 0,
      fee_vat_cents: 0,
      // The donor's cover for the card charge: it goes to the charity's line, and the provider takes its charge from there.
      processing_charge_cents: fees.cardChargeCents,
      total_charged_cents: fees.totalCents,
      status: "pending",
      gateway: gateway.name,
      gateway_ref: donationId,
      recurring_id: recurringId,
      ...(campaign ? { campaign_id: campaign.id } : {}),
      came_from: cameFromOf({ fromApp: args.fromApp, tag: args.sourceTag }),
      wants_18a: want18a,
      is_anonymous: v.is_anonymous === "on",
      message: v.message ?? null,
      // Only when there is one, so taking a donation keeps working even if this code goes live before the dedications database change (other screens do need it: run the database change first).
      ...(dedication ? { dedication_kind: dedication.kind, dedication_name: dedication.name } : {}),
      popia_consent_at: now,
      age_confirmed_at: now,
    });
    if (error) throw error;

    // Everything below hangs off the gift saved above and doesn't depend on each other, so it is written side by side
    // rather than in turn (12/11/2026: pressing Give took about 3 seconds before the payment page). Any failure still
    // stops the gift before the payment page, as before.
    const label = givingLabelOf(v);
    [confirmationToken] = await Promise.all([
      // Sent only to the donor, in the address the gateway returns them to.
      issueConfirmationToken(donationId),
      // So a declined card reported later counts against whoever started this gift (card-testing protection).
      rememberGiftStart(donationId, v.email, args.ip),
      (async () => {
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
          // Only set when started by that account (signed in with this email): see saved-id.ts.
          ...(startedBy ? { started_by_user: startedBy } : {}),
          ...(detailsNow
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
      })(),
      (async () => {
        // What the donor agreed to, and which version of the Terms and Privacy Policy they saw.
        const consent = await db.from("consents").insert({ kind: "donation", policy_version: legalConfig.policyVersion, donation_id: donationId });
        if (consent.error) throw consent.error;
      })(),
      (async () => {
        if (!recurringId) return;
        // What the donor authorised: the same amount every month until they cancel.
        const link = await db.from("recurring_donations").update({ first_donation_id: donationId }).eq("id", recurringId);
        if (link.error) throw link.error;
        const auth = await db.from("consents").insert({ kind: "monthly_authorisation", policy_version: legalConfig.policyVersion, donation_id: donationId });
        if (auth.error) throw auth.error;
      })(),
      (async () => {
        if (!args.saveCardFor) return;
        // The donor ticked "Save my card": what they agreed to, and the card is kept once this payment is confirmed.
        const keep = await db.from("consents").insert({ kind: "saved_card", policy_version: legalConfig.policyVersion, donation_id: donationId });
        if (keep.error) throw keep.error;
        await requestCardSave(donationId, args.saveCardFor.userId);
      })(),
      (async () => {
        // The donor's own label for the gift, if they gave one. Kept in a table only the donor
        // can read: charities never see it.
        if (!label) return;
        const kept = await db.from("donation_giving_kinds").insert({ donation_id: donationId, label });
        if (kept.error) throw kept.error;
      })(),
    ]);
  } catch (e) {
    if (!savedToken) await closeUnstarted();
    throw e;
  }

  if (savedToken) return chargeSavedCard({ donationId, savedToken, v, fees, charity, token: confirmationToken, resumed: false });

  try {
    const site = process.env.SITE_URL ?? "";
    const { redirectUrl } = await gateway.createCheckout({
      reference: donationId,
      totalCents: fees.totalCents,
      lines: { charityCents: fees.amountCents + fees.cardChargeCents, contributionCents: fees.contributionCents },
      charityAccountRef: charity.splitAccountRef,
      feeBearer: platformConfig.fees.gatewayChargePaidBy,
      email: v.email,
      saveCard: monthly || Boolean(args.saveCardFor),
      returnUrl: `${site}/donate/return?reference=${donationId}&t=${confirmationToken}${args.fromApp ? "&from=app" : ""}`,
      description: `Donation to ${charity.name_en}`,
    });
    return { ok: true, redirectUrl, reference: donationId, token: confirmationToken };
  } catch (e) {
    await closeUnstarted();
    if (e instanceof GatewayError) {
      console.error(e);
      return { ok: false, message: "We couldn't reach the payment provider, so nothing was charged. What you typed is still here. Please try again in a minute.", providerDown: true };
    }
    throw e;
  }
}

/** A saved-card gift recorded this recently may still be on its way to the provider: it is never charged from a retry. */
const RESUME_AFTER_MS = 2 * 60_000;

/**
 * What the provider holds under this reference: its status when it has the payment, "no" only when it says so
 * plainly that it has never seen it, "unknown" when it can't be asked.
 */
async function providerKnows(reference: string): Promise<"success" | "failed" | "pending" | "no" | "unknown"> {
  try {
    return (await getGateway().verifyTransaction(reference)).status;
  } catch (e) {
    if (e instanceof GatewayError && e.notFound) return "no";
    console.error(e);
    return "unknown";
  }
}

/**
 * A retried saved-card gift whose first try stopped before the charge: the records that come after the
 * donation row, each added only if it is missing. (The checkout details are already there: the retry
 * matched on their email.) Saved-card gifts are once-off and never save a card, so nothing else applies.
 */
async function finishSavedCardRecords(donationId: string, v: CheckoutInput): Promise<void> {
  const db = createAdminClient();
  const { data: agreed, error: readError } = await db.from("consents").select("id").eq("donation_id", donationId).eq("kind", "donation").limit(1);
  if (readError) throw readError;
  if (!agreed?.length) {
    const consent = await db.from("consents").insert({ kind: "donation", policy_version: legalConfig.policyVersion, donation_id: donationId });
    if (consent.error) throw consent.error;
  }
  const label = givingLabelOf(v);
  if (label) {
    const kept = await db.from("donation_giving_kinds").upsert({ donation_id: donationId, label }, { onConflict: "donation_id", ignoreDuplicates: true });
    if (kept.error) throw kept.error;
  }
}

/**
 * Charge the donor's saved card: no payment page. A refusal (declined, expired) ends this gift; anything else
 * (a timeout, an outage) leaves it pending, because the charge may have gone through and a second charge must
 * never follow. Either way the answer only counts once confirmed with the provider (api/app/status).
 */
async function chargeSavedCard(a: {
  donationId: string;
  savedToken: { code: string };
  v: CheckoutInput;
  fees: Quote;
  charity: { name_en: string; splitAccountRef: string | null };
  token: string;
  /** A retry sending the charge its first try never sent. */
  resumed: boolean;
}): Promise<StartResult> {
  const db = createAdminClient();
  const gateway = getGateway();
  const failGift = async (): Promise<StartResult> => {
    // A retried charge the provider turned down may have been turned down because the first one did reach it
    // after all (the same reference twice): then the provider's own record decides. A payment it holds as paid or
    // still going is answered as charged (the status check settles it); one it holds as declined is declined; one
    // it can't be asked about is neither claimed nor marked failed.
    if (a.resumed) {
      const known = await providerKnows(a.donationId);
      if (known === "success" || known === "pending") return { ok: true, charged: true, reference: a.donationId, token: a.token };
      if (known === "unknown") {
        return { ok: false, message: "We couldn't check this gift with the payment provider. Please wait a minute and try again. Your card won't be charged twice." };
      }
    }
    await db.from("donations").update({ status: "failed", failed_at: new Date().toISOString() }).eq("id", a.donationId).eq("status", "pending");
    return { ok: false, savedCardDeclined: true, message: "Your saved card was declined. Please pay on the payment page with a different card." };
  };
  try {
    const { status } = await gateway.chargeAuthorization({
      reference: a.donationId,
      authorizationCode: a.savedToken.code,
      email: a.v.email,
      totalCents: a.fees.totalCents,
      lines: { charityCents: a.fees.amountCents + a.fees.cardChargeCents, contributionCents: a.fees.contributionCents },
      charityAccountRef: a.charity.splitAccountRef,
      feeBearer: platformConfig.fees.gatewayChargePaidBy,
      description: `Donation to ${a.charity.name_en}`,
      monthly: false,
    });
    if (status === "failed") return await failGift();
  } catch (e) {
    if (isGatewayRefusal(e)) return await failGift();
    console.error(e);
  }
  return { ok: true, charged: true, reference: a.donationId, token: a.token };
}

/**
 * One donor identity per email + type (+ registration number).
 * An existing identity is never overwritten from a guest checkout (anyone can
 * type any email); only empty fields are filled. The details exactly as typed
 * are kept with the donation itself.
 *
 * A record that belongs to an account (someone signed in with that email) is not filled in at all unless this gift
 * was started by that same account (`startedBy`): otherwise anyone could plant a name, phone, ID ending or address
 * on another person's details by giving with their email (security review, 12/11/2026).
 */
async function findOrCreateDonor(v: CheckoutInput, want18a: boolean, startedBy: string | null): Promise<string> {
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
      const owner = (existing as { user_id?: string | null }).user_id ?? null;
      if (owner && owner !== startedBy) return existing.id;
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
