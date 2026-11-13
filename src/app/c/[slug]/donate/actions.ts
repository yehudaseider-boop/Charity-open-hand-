"use server";

import { headers } from "next/headers";
import { startDonation, type Quote } from "@/lib/donations/checkout";
import { loadDonatableCharity } from "@/lib/donations/charity";
import { agreementErrors, applyAgreementTick, checkDonorDetails, checkoutSchema, cleanPhone, type CheckoutInput } from "@/lib/donations/validation";
import { clientIp } from "@/lib/client-ip";
import { getViewer } from "@/lib/auth";
import { formToObject } from "@/lib/form";
import { platformConfig } from "@/config/platform";
import { SOURCE_PARAM } from "@/lib/donations/source";
import { botCheck, PRESS_AGAIN_MESSAGE } from "@/lib/donations/giving-guard-rules";
import { recordBlocked } from "@/lib/donations/giving-guard";

export type CheckoutState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  quote?: Quote;
  /** The payment never started (offline, or the server failed): the page offers a person to ask. */
  failedToStart?: boolean;
  /** The campaign ended while the donor was on the page: the page offers giving to the charity instead. */
  campaignEnded?: boolean;
  /**
   * The payment provider's page for this gift. The form opens it itself (13/11/2026), rather than through a server
   * redirect: a redirect kept the button on "Still working on it…" for as long as the phone took to open the page,
   * with no way forward if it never did. Now the form says the page is opening and offers a link to it.
   */
  redirectUrl?: string;
};

export async function submitDonation(
  slug: string,
  giftCents: number,
  contributionCents: number,
  coverCardCharge: boolean,
  shownTotalCents: number,
  fromApp: boolean,
  campaignId: string | undefined,
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  // Quiet bot checks (card-testing protection): bots fill in every field, including the hidden one, and send the
  // form the instant the page opens. A real person caught by either simply presses Give again; what they typed stays.
  const bot = botCheck({ honeypot: formData.get("website"), openMs: formData.get("form_open_ms"), minFillSeconds: platformConfig.givingGuard.minFillSeconds });
  formData.delete("form_open_ms");
  if (bot !== "ok") {
    await recordBlocked("bot");
    return { ok: false, message: PRESS_AGAIN_MESSAGE };
  }

  // One agreement tick or two (platformConfig.checkout.singleAgreementTick): the same agreements are recorded either way.
  const single = platformConfig.checkout.singleAgreementTick;
  const raw = applyAgreementTick(formToObject(formData), single);
  // Where the link came from (WhatsApp, a copied link, the QR poster): checked in startDonation, not a donor detail.
  const sourceTagged = typeof raw[SOURCE_PARAM] === "string" ? raw[SOURCE_PARAM] : null;
  delete raw[SOURCE_PARAM];
  raw.phone = cleanPhone(raw.phone);
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    // Everything to fix in one go, not a round at a time: the other checks run on what was typed too.
    const charity = await loadDonatableCharity(slug);
    // With "use my ID ending 1234" the server fills in the ID and address from their earlier gift, so the
    // s18A checks don't apply yet (startDonation runs them on the merged details).
    const usingSavedId = formData.get("use_saved_id") === "on";
    for (const [k, v] of Object.entries(checkDonorDetails(raw as CheckoutInput, Boolean(charity?.receiptsAvailable) && !usingSavedId))) fieldErrors[k] ??= v;
    const shown = agreementErrors(fieldErrors, single);
    return { ok: false, message: fixMessage(shown), fieldErrors: shown };
  }

  const h = await headers();
  const ip = clientIp(h);
  // Who is signed in, checked here on the server: the gift counts as theirs (and can later give "Use my ID ending
  // 1234") only when it is given with their own email. "Use my ID ending 1234" itself only when ticked.
  const viewer = await getViewer();
  const signedInAs = viewer?.email ? { userId: viewer.userId, email: viewer.email } : undefined;
  const useSavedIdOf = formData.get("use_saved_id") === "on" ? signedInAs : undefined;
  const result = await startDonation({ charitySlug: slug, giftCents, contributionCents, coverCardCharge, shownTotalCents, fromApp, campaignId, sourceTag: sourceTagged, input: parsed.data, ip, signedInAs, useSavedIdOf });
  if (!result.ok) {
    const { providerDown, ...rest } = result;
    if (rest.message === "Please check the highlighted fields." && rest.fieldErrors) {
      const shown = agreementErrors(rest.fieldErrors, single);
      return { ...rest, fieldErrors: shown, message: fixMessage(shown) };
    }
    return { ...rest, failedToStart: providerDown };
  }
  // The website never charges a saved card (only the app does), so there is always a payment page.
  if (!isWebAddress(result.redirectUrl)) return { ok: false, message: "We couldn't start the payment. Please try again." };
  return { ok: true, redirectUrl: result.redirectUrl };
}

/** Only a web address is ever handed to the browser to open. */
function isWebAddress(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** The line by the Pay button when fields need fixing. */
function fixMessage(fieldErrors: Record<string, string>): string {
  const n = Object.keys(fieldErrors).length;
  return n === 1 ? "Please fix the field marked in red above." : `Please fix the ${n} fields marked in red above.`;
}
