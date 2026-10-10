import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { donationReference } from "./reference";

/**
 * The donor's payment confirmation. DRAFT WORDING for Yehuda's review.
 * This is a payment confirmation, not an s18A receipt: that comes once a
 * year, after the tax year closes.
 */
export function confirmationEmail(d: {
  id: string;
  charityName: string;
  amountCents: number;
  contributionCents: number;
  totalCents: number;
  paidAt: string;
  wants18a: boolean;
}) {
  const ref = donationReference(d.id);
  const lines = [
    `Thank you. Your donation to ${d.charityName} has gone through.`,
    "",
    `Donation to ${d.charityName}: ${formatRand(d.amountCents)}`,
    ...(d.contributionCents > 0 ? [`Contribution to NEDIV lev: ${formatRand(d.contributionCents)}`] : []),
    `Total paid: ${formatRand(d.totalCents)} on ${formatDate(d.paidAt)}`,
    `Reference: ${ref}`,
    "",
    d.wants18a
      ? "This donation will be on your annual s18A receipt, which we send after the tax year closes at the end of February."
      : "You did not ask for an s18A receipt for this donation.",
    "",
    "You can see all your donations, and your maaser and chomesh, in the NEDIV lev app. Sign in with this email address.",
    "",
    "NEDIV lev",
  ];
  return { subject: `Your donation to ${d.charityName} (${ref})`, text: lines.join("\n") };
}
