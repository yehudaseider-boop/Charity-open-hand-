/**
 * Emails to charities along the sign-up journey. DRAFT WORDING for Yehuda to approve before go-live.
 * Pure builders (tested); sending is done by `notifyCharity` and never blocks the action that sent it.
 */
import { getEmailTransport, type EmailMessage } from "@/lib/email";
import { formatRand } from "@/lib/money";

const sign = ["", "The Givezy team"];
const site = (env: Record<string, string | undefined> = process.env) => (env.SITE_URL ?? "").replace(/\/+$/, "");

export function applicationReceivedEmail(to: string, charityName: string, base = site()): EmailMessage {
  return {
    to,
    subject: `We have your application for ${charityName}`,
    text: [
      `Thank you for applying to list ${charityName} on Givezy.`,
      "",
      "We check every application by hand: your registration, your bank confirmation letter and, if you issue s18A receipts, your approval and mandate. This usually takes a few working days. We will email you as soon as it has been reviewed.",
      "",
      `You can see your application at any time: ${base}/charity-admin`,
      ...sign,
    ].join("\n"),
  };
}

export function publicChangeEmail(to: string, charityName: string, charityId: string, what: string, base = site()): EmailMessage {
  return {
    to,
    subject: `${charityName} changed its public page`,
    text: [`${charityName}, an approved charity, changed ${what}. Check it still matches the organisation you vetted.`, "", `Review it: ${base}/admin/charities/${charityId}`].join("\n"),
  };
}

export function newApplicationEmail(to: string, charityName: string, charityId: string, base = site()): EmailMessage {
  return {
    to,
    subject: `New charity application: ${charityName}`,
    text: [`${charityName} has submitted its application and is waiting for review.`, "", `Review it: ${base}/admin/charities/${charityId}`].join("\n"),
  };
}

export function approvedEmail(to: string, charityName: string, charityId: string, s18a: boolean, base = site()): EmailMessage {
  return {
    to,
    subject: `${charityName} is approved on Givezy`,
    text: [
      `Good news: ${charityName} has been approved and is now listed on Givezy.`,
      "",
      s18a
        ? "Donors who ask for an s18A receipt will get one in your name, issued by Givezy under your mandate."
        : "Donors can give to you now. You can't issue s18A receipts through Givezy yet; tell us once you have s18A approval and we'll set it up.",
      "",
      "A few things help donors find you and give:",
      "1. Add a cover photo and a few words about your work.",
      "2. Post a short update about what donations did lately.",
      "3. Start a campaign if you're raising for something specific.",
      "4. Share your Givezy page with your community.",
      "",
      `Your dashboard: ${base}/charity-admin/${charityId}`,
      "",
      "Online donations start once we have connected your bank account to our payment provider. We'll do that and let you know.",
      ...sign,
    ].join("\n"),
  };
}

export function suspendedEmail(to: string, charityName: string, charityId: string, reason: string, base = site()): EmailMessage {
  return {
    to,
    subject: `${charityName} is paused on Givezy`,
    text: [
      `We have paused ${charityName} on Givezy. While it is paused, your page is hidden and donors can't give to you. Monthly donations to you are not collected.`,
      "",
      "The reason:",
      reason,
      "",
      `Your dashboard still works, and your past donations and receipts are kept: ${base}/charity-admin/${charityId}`,
      "",
      "To sort this out, reply to this email.",
      ...sign,
    ].join("\n"),
  };
}

export function reinstatedEmail(to: string, charityName: string, charityId: string, base = site()): EmailMessage {
  return {
    to,
    subject: `${charityName} is back on Givezy`,
    text: [`${charityName} is listed on Givezy again, and donors can give to you.`, "", `Your dashboard: ${base}/charity-admin/${charityId}`, ...sign].join("\n"),
  };
}

export function connectedEmail(to: string, charityName: string, charityId: string, base = site()): EmailMessage {
  return {
    to,
    subject: `${charityName} can take online donations now`,
    text: [
      `Your bank account is connected to our payment provider, so ${charityName} can take online donations on Givezy from today.`,
      "",
      "Each donation goes straight to your bank account. The payment provider's card fee comes off each donation before it reaches you.",
      "",
      `Share your page, or print your QR poster: ${base}/charity-admin/${charityId}/poster`,
      ...sign,
    ].join("\n"),
  };
}

export function receiptsReadyEmail(to: string, charityName: string, charityId: string, base = site()): EmailMessage {
  return {
    to,
    subject: `s18A receipts are set up for ${charityName}`,
    text: [
      `We've confirmed your s18A approval and receipting mandate. From now on, donors to ${charityName} can ask for an s18A receipt, issued by Givezy in your name under your mandate.`,
      "",
      `See your receipts: ${base}/charity-admin/${charityId}/receipts`,
      ...sign,
    ].join("\n"),
  };
}

export function adminRemovedEmail(to: string, charityName: string): EmailMessage {
  return {
    to,
    subject: `You no longer manage ${charityName} on Givezy`,
    text: [
      `Your access to manage ${charityName} on Givezy has been removed. You can still sign in to Givezy as a donor.`,
      "",
      "If you think this is a mistake, reply to this email.",
      ...sign,
    ].join("\n"),
  };
}

export function contactChangedEmail(to: string, charityName: string, newEmail: string): EmailMessage {
  return {
    to,
    subject: `The contact email for ${charityName} on Givezy was changed`,
    text: [
      `The contact email for ${charityName} on Givezy was changed to ${newEmail}. Our emails about the charity now go there instead of to this address.`,
      "",
      "If you did not expect this, reply to this email straight away.",
      ...sign,
    ].join("\n"),
  };
}

export function secondStepResetEmail(to: string): EmailMessage {
  return {
    to,
    subject: "Your Givezy second step was reset",
    text: [
      "At your request, we removed the authenticator app linked to your Givezy account. Next time you sign in to manage a charity, you'll be asked to set up a new one.",
      "",
      "If you did not ask for this, reply to this email straight away.",
      ...sign,
    ].join("\n"),
  };
}

export function sentBackEmail(to: string, charityName: string, charityId: string, reason: string, base = site()): EmailMessage {
  return {
    to,
    subject: `Your Givezy application for ${charityName} needs a change`,
    text: [
      `We've looked at the application for ${charityName}, and there is something to fix before we can approve it:`,
      "",
      reason,
      "",
      `Make the change and submit again here: ${base}/charity-admin/${charityId}/application`,
      "",
      "If anything is unclear, reply to this email.",
      ...sign,
    ].join("\n"),
  };
}

export function inviteEmail(to: string, charityName: string, link: string): EmailMessage {
  return {
    to,
    subject: `An invitation to list ${charityName} on Givezy`,
    text: [
      `We'd like to invite ${charityName} to join Givezy, where the community gives to local charities in a few taps.`,
      "",
      "Listing is free. Donations go straight to your bank account, and if you have s18A approval we issue your donors' tax receipts for you.",
      "",
      `Start your application (your name is already filled in): ${link}`,
      "",
      "The link works for 30 days.",
      ...sign,
    ].join("\n"),
  };
}

/**
 * "You received a donation": the amount to the charity only (never the contribution to Givezy) and,
 * if there was one, the campaign. No donor details: the charity sees those on its dashboard.
 */
export function donationReceivedEmail(
  to: string,
  d: { charityName: string; charityId: string; amountCents: number; monthly: boolean; campaignTitle: string | null },
  base = site(),
): EmailMessage {
  const what = d.monthly ? "a monthly donation" : "a donation";
  return {
    to,
    subject: `${d.charityName} received ${formatRand(d.amountCents)} on Givezy`,
    text: [
      `${d.charityName} has received ${what} of ${formatRand(d.amountCents)} through Givezy${d.campaignTitle ? `, for your campaign "${d.campaignTitle}"` : ""}.`,
      "",
      "The money is paid into your bank account by our payment provider. Who gave, and any message or dedication, is on your dashboard.",
      "",
      `Your dashboard: ${base}/charity-admin/${d.charityId}/donations`,
      "",
      `You can turn these emails off on your profile page: ${base}/charity-admin/${d.charityId}/profile`,
      ...sign,
    ].join("\n"),
  };
}

/** Send, and never let a failed email undo or block what already happened. */
export async function notifyCharity(message: EmailMessage | null): Promise<void> {
  if (!message?.to) return;
  try {
    await getEmailTransport().send(message);
  } catch (e) {
    console.error("[charity email] not sent", e);
  }
}
