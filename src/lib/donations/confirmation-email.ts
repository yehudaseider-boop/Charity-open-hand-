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
  /** Part of a monthly donation: its first payment, a later one, or a first payment whose card cannot be charged again. */
  monthly?: { kind: "first"; chargeDay: number; cardLast4: string | null } | { kind: "repeat" } | { kind: "not_started" };
  /** Where a donor manages their monthly donation on the website, when known. */
  manageUrl?: string;
  /** "In memory of Chaim Cohen", if the donor dedicated the donation. */
  dedication?: string | null;
}) {
  const ref = donationReference(d.id);
  const lines = [
    `Thank you. Your donation to ${d.charityName} has gone through.`,
    "",
    `Donation to ${d.charityName}: ${formatRand(d.amountCents)}`,
    ...(d.contributionCents > 0 ? [`Contribution to Givezy: ${formatRand(d.contributionCents)}`] : []),
    `Total paid: ${formatRand(d.totalCents)} on ${formatDate(d.paidAt)}`,
    `Reference: ${ref}`,
    ...(d.dedication ? [d.dedication] : []),
    "",
    d.wants18a
      ? "This donation will be on your annual s18A receipt, which we send after the tax year closes at the end of February."
      : "You did not ask for an s18A receipt for this donation.",
    "",
    ...monthlyLines(d),
    "You can see all your donations, and your giving goal, in the Givezy app. Sign in with this email address.",
    "",
    "Givezy",
  ];
  return { subject: `Your donation to ${d.charityName} (${ref})`, text: lines.join("\n") };
}

function monthlyLines(d: { monthly?: Parameters<typeof confirmationEmail>[0]["monthly"]; manageUrl?: string; totalCents: number }): string[] {
  const manage = `You can pause or cancel at any time in the Givezy app (Giving tab)${d.manageUrl ? ` or at ${d.manageUrl}` : ""}.`;
  if (!d.monthly) return [];
  if (d.monthly.kind === "first") {
    return [
      `This is the first payment of your monthly donation. Unless you cancel, we will collect ${formatRand(d.totalCents)} on day ${d.monthly.chargeDay} of each month${d.monthly.cardLast4 ? ` from your card ending ${d.monthly.cardLast4}` : ""}. If a month has fewer days, we collect on its last day.`,
      manage,
      "",
    ];
  }
  if (d.monthly.kind === "repeat") return ["This was your monthly donation.", manage, ""];
  return [
    "Your payment went through, but the payment method you used cannot be charged again, so your monthly donation has not been set up. To give monthly, start again and pay by card.",
    "",
  ];
}
