/**
 * One copy of every email Givezy sends, filled with plainly fake sample details (19/11/2026), so a person can read
 * each one in a real inbox (Gmail, Outlook, a phone) before launch. Every subject starts with "[Sample]" and every
 * name, number and amount is made up. The same builders the real sends use, so what arrives is what donors and
 * charities will get. Sign-in codes are Supabase's own email and are not here.
 */
import { confirmationEmail } from "@/lib/donations/confirmation-email";
import { monthlyFailedEmail } from "@/lib/donations/monthly-email";
import { buildReceiptEmail } from "@/lib/receipts/email";
import { buildDeclineEmail } from "@/lib/receipts/review";
import type { ReceiptDetails } from "@/lib/receipts/details";
import { s18aReminderEmail } from "@/lib/charity/s18a-reminder";
import { oneDonorThankYouEmail, thankYouEmail } from "@/lib/charity/thank-you";
import { journeyEmail } from "@/lib/charity/journey";
import { appealEmail } from "@/lib/charity/appeals-rules";
import { joinedEmail } from "@/lib/charity-requests";
import {
  adminRemovedEmail,
  applicationReceivedEmail,
  approvedEmail,
  bankChangedEmail,
  connectedEmail,
  contactChangedEmail,
  contactPhoneChangedEmail,
  donationReceivedEmail,
  inviteEmail,
  memberAddedEmail,
  newApplicationEmail,
  publicChangeEmail,
  receiptsReadyEmail,
  reinstatedEmail,
  secondStepResetEmail,
  sentBackEmail,
  suspendedEmail,
} from "@/lib/charity/emails";
import { platformConfig } from "@/config/platform";
import type { EmailMessage } from "./index";

export const SAMPLE_PREFIX = "[Sample] ";

/** Made-up details, the same in every sample. */
export const SAMPLE = {
  charity: "Sample Meals Fund",
  charityId: "00000000-0000-0000-0000-000000000000",
  firstName: "Thandi",
  reference: "GZ-SAMPLE1",
  receiptReference: "SAMPLE-0001",
} as const;

/** The receipt in the sample s18A email (its PDF is made separately, marked as a sample). */
export function sampleReceiptDetails(): ReceiptDetails {
  return {
    charity: {
      legal_name_en: "Sample Meals Fund NPC",
      npo_number: "000-000 NPO",
      pbo_number: "000000000",
      s18a_reference: "SAMPLE-18A",
      address: ["1 Sample Street", "Johannesburg", "2000"],
    },
    donor: { donor_type: "individual", name: "Thandi Sample", registration_number: null, id_number_last4: "0000", tax_reference_last4: null, address: ["2 Example Road", "Cape Town", "8001"] },
    donations: [
      { date: "05/03/2026", amount_cents: 125_000, reference: "GZ-SAMPLE1", nature: "Card (online)" },
      { date: "05/04/2026", amount_cents: 125_000, reference: "GZ-SAMPLE2", nature: "Card (online)" },
    ],
    tax_year: 2027,
    period: "01/03/2026 to 28/02/2027",
    wording: { title: "Section 18A receipt", statement: "Sample only. This is not a tax receipt." },
    issued_on: "19/11/2026",
  };
}

/** Every email, addressed to `to`, with "[Sample]" in front of its subject. `base` is the site address in links. */
export function sampleEmails(to: string, base: string): EmailMessage[] {
  const c = SAMPLE.charity;
  const id = SAMPLE.charityId;
  const stop = `${base}/thanks/stop`;
  const detailsUrl = `${base}/account`;
  const donor = { charityName: c, firstName: SAMPLE.firstName, stopUrl: stop, replyTo: null };
  const addressed = (m: { subject: string; text: string; html?: string; quoted?: EmailMessage["quoted"] }): EmailMessage => ({ to, ...m });

  const list: EmailMessage[] = [
    // Donors
    addressed(confirmationEmail({ id: SAMPLE.reference, charityName: c, amountCents: 125_000, contributionCents: 1_000, totalCents: 126_000, paidAt: new Date().toISOString(), wants18a: true, charityNote: "Thank you, Thandi. We are so grateful you thought of us." })),
    addressed(confirmationEmail({ id: SAMPLE.reference, charityName: c, amountCents: 25_000, contributionCents: 0, totalCents: 25_000, paidAt: new Date().toISOString(), wants18a: true, s18aDetailsMissing: true, s18aDetailsDeadline: "31/05/2027", accountUrl: detailsUrl, monthly: { kind: "first", chargeDay: 5, cardLast4: "4242" }, manageUrl: detailsUrl })),
    addressed(monthlyFailedEmail({ charityName: c, totalText: "R250", cardLast4: "4242", final: false, manageUrl: detailsUrl, newCardUrl: `${base}/monthly/new-card` })),
    addressed(monthlyFailedEmail({ charityName: c, totalText: "R250", cardLast4: "4242", final: true, manageUrl: detailsUrl })),
    addressed(buildReceiptEmail({ details: sampleReceiptDetails(), reference: SAMPLE.receiptReference, siteUrl: base, platformName: platformConfig.appName })),
    addressed(buildDeclineEmail({ donorName: "Thandi Sample", donorType: "individual", charityName: c, taxYear: 2027, totalCents: 250_000, contactPhone: "011 000 0000", contactEmail: "info@example.org", siteUrl: base, platformName: platformConfig.appName })),
    s18aReminderEmail(to, { ...donor, missing: ["id_number", "address"], detailsUrl, deadline: "31/05/2027" }),
    oneDonorThankYouEmail(to, { ...donor, body: "Thank you for your gift. It means a lot to the families we cook for." }),
    thankYouEmail(to, { ...donor, month: "2026-11", body: "Thank you for standing with us this month." }),
    journeyEmail(to, { ...donor, subject: "How your first gift helped", body: "A month ago you gave for the first time. Here is what it did.", pageUrl: `${base}/c/demo-charity` }),
    appealEmail(to, { ...donor, subject: "Help us fill the pantry for December", body: "December is our busiest month. Can you help again?" }),
    { to, ...joinedEmail(c, `${base}/c/demo-charity`) },
    // Charities
    applicationReceivedEmail(to, c, base),
    sentBackEmail(to, c, id, "The bank letter is older than three months. Please upload a recent one.", base),
    approvedEmail(to, c, id, "ready", base),
    approvedEmail(to, c, id, "mandate", base),
    connectedEmail(to, c, id, base),
    receiptsReadyEmail(to, c, id, base),
    donationReceivedEmail(to, { charityName: c, charityId: id, amountCents: 125_000, monthly: true, campaignTitle: null }, base),
    publicChangeEmail(to, c, id, "your description", base),
    memberAddedEmail(to, c, id, base),
    inviteEmail(to, c, `${base}/apply`),
    bankChangedEmail(to, c, "19/11/2026", "0000", true),
    contactChangedEmail(to, c, "new-contact@example.org"),
    contactPhoneChangedEmail(to, c, "082 000 0000"),
    secondStepResetEmail(to),
    adminRemovedEmail(to, c),
    suspendedEmail(to, c, id, "We could not confirm your registration.", base),
    reinstatedEmail(to, c, id, true, base),
    // Givezy's own team
    newApplicationEmail(to, c, id, base),
  ];
  return list.map((m) => ({ ...m, to, subject: `${SAMPLE_PREFIX}${m.subject}`, headers: undefined }));
}
