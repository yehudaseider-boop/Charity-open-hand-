import { csvPhone } from "@/lib/csv";
import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { isErasedEmail, shownEmail } from "./dashboard";
import type { DonorRow } from "./dashboard-queries";

/**
 * Donors laid out for Salesforce's Data Import Wizard (Contacts): standard field names only, so every
 * column maps without any set-up. A Contact needs a last name, so a donor with one word for a name has it
 * there, and an organisation's name goes in both Last Name and Account Name. The giving summary goes in
 * Description. Donors who asked to be erased are left out: their name is already gone.
 */
export const SALESFORCE_HEADER = ["First Name", "Last Name", "Email", "Phone", "Account Name", "Lead Source", "Description"];

export function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: "", last: parts[0] ?? "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

export function salesforceRows(donors: DonorRow[]): string[][] {
  return donors
    .filter((d) => !isErasedEmail(d.email))
    .map((d) => {
      const organisation = d.donor_type !== "individual";
      const { first, last } = organisation ? { first: "", last: d.display_name } : splitName(d.display_name);
      const gifts = `${d.donation_count} ${d.donation_count === 1 ? "gift" : "gifts"}`;
      const description = `Givezy donor: ${gifts}, ${formatRand(d.total_cents)} in total, first gift ${formatDate(d.first_paid_at)}, last gift ${formatDate(d.last_paid_at)}`;
      return [first, last, shownEmail(d.email) ?? "", csvPhone(d.phone), organisation ? d.display_name : "", "Givezy", description];
    });
}
