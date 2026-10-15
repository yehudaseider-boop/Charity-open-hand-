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
