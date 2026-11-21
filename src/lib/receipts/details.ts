/**
 * The snapshot of everything printed on a receipt. It is stored with the
 * receipt, so the PDF can always be reproduced exactly, whatever happens to
 * the charity's or donor's records later.
 */
import { receiptConfig } from "@/config/receipts";
import { formatDate } from "@/lib/dates";
import { donationReference } from "@/lib/donations/reference";
import { RECORDED_METHODS } from "@/lib/charity/recorded-gifts";

export type CharityRow = {
  legal_name_en: string;
  legal_name_he?: string | null; // no longer read or printed (30/10/2026); old receipts may still carry it
  npo_number: string | null;
  pbo_number: string | null;
  s18a_reference: string | null;
  address_line1: string | null;
  address_line2: string | null;
  suburb: string | null;
  city: string | null;
  postal_code: string | null;
  quickgive_code: string;
};

export type DonorRow = {
  donor_type: "individual" | "company" | "trust";
  first_name: string | null;
  last_name: string | null;
  organisation_name: string | null;
  registration_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  suburb: string | null;
  city: string | null;
  postal_code: string | null;
  id_number_last4: string | null;
  tax_reference_last4: string | null;
};

/** The donor's name as printed on a receipt: a person's first and last name, or the organisation's. */
export function receiptDonorName(d: Pick<DonorRow, "donor_type" | "first_name" | "last_name" | "organisation_name">): string {
  return d.donor_type === "individual" ? lines(d.first_name, d.last_name).join(" ") : (d.organisation_name ?? "").trim();
}

export type ReceiptDetails = {
  charity: {
    legal_name_en: string;
    legal_name_he?: string | null;
    npo_number: string | null;
    pbo_number: string | null;
    s18a_reference: string | null;
    address: string[];
  };
  donor: {
    donor_type: DonorRow["donor_type"];
    name: string;
    registration_number: string | null;
    id_number_last4: string | null;
    tax_reference_last4: string | null;
    address: string[];
  };
  /** reference and nature were added 30/10/2026; receipts issued before then have neither. */
  donations: { date: string; amount_cents: number; reference?: string; nature?: string }[];
  tax_year: number;
  period: string;
  wording: { title: string; statement: string };
  issued_on: string;
};

const lines = (...parts: (string | null | undefined)[]) => parts.map((p) => p?.trim()).filter((p): p is string => Boolean(p));

/**
 * The nature of a donation as printed on a receipt: how the money came in. Gifts a charity recorded by hand say how
 * they came in. An online gift says "Card (online)" when the payment provider said card, or when it said nothing
 * (every gift before 17/11/2026, which only ever offered cards); any other method the provider reports prints as
 * "Online payment", never as a card: the exact words for Apple Pay, instant EFT and the rest wait for Yosef and for
 * the provider's own names for them (seen in its test mode).
 */
export function donationNature(recordedMethod: string | null | undefined, paymentChannel?: string | null): string {
  if (recordedMethod) return Object.hasOwn(RECORDED_METHODS, recordedMethod) ? RECORDED_METHODS[recordedMethod as keyof typeof RECORDED_METHODS] : "Other";
  if (!paymentChannel || paymentChannel === "card") return "Card (online)";
  return "Online payment";
}

/**
 * What SARS needs on an s18A receipt that this one lacks (section 18A(2)): the charity's reference number from
 * SARS (its s18A reference or PBO number), the donor's and the charity's names and addresses. Empty when nothing
 * is missing.
 */
export function missingForSars(d: ReceiptDetails): string[] {
  const out: string[] = [];
  if (noSarsReference(d.charity)) out.push(CHARITY_REFERENCE);
  if (!d.donor.name) out.push("the donor's name");
  if (!d.donor.address.length) out.push("the donor's address");
  if (!d.charity.address.length) out.push(CHARITY_ADDRESS);
  return out;
}

const CHARITY_REFERENCE = "the charity's SARS reference number";
const CHARITY_ADDRESS = "the charity's address";
const noSarsReference = (c: { s18a_reference: string | null; pbo_number: string | null }) => !c.s18a_reference?.trim() && !c.pbo_number?.trim();

/**
 * What missingForSars would refuse every one of a charity's receipts for: its SARS reference number (s18A reference
 * or PBO number) and its address (21/11/2026). Checked before the charity's list is shown as ready to approve, so a
 * list is never approved and signed off only for every receipt on it to fail.
 */
export function missingForCharity(c: Pick<CharityRow, "s18a_reference" | "pbo_number" | "address_line1" | "address_line2" | "suburb" | "city" | "postal_code">): string[] {
  const out: string[] = [];
  if (noSarsReference(c)) out.push(CHARITY_REFERENCE);
  if (!lines(c.address_line1, c.address_line2, c.suburb, c.city, c.postal_code).length) out.push(CHARITY_ADDRESS);
  return out;
}

/** "a, b and c". */
export function andList(items: string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The charity's own words for what missingForCharity found: what is missing, why it blocks the list, and that nothing
 * was approved. "Your charity's address and SARS reference number aren't on your Givezy record yet ..."
 */
export function charityMissingWords(missing: string[]): string {
  const what = andList(missing.map((m) => m.replace(/^the charity's /, "")));
  const one = missing.length === 1;
  return `Your charity's ${what} ${one ? "isn't" : "aren't"} on your Givezy record yet, and SARS needs ${one ? "it" : "both"} on every s18A receipt, so none can be approved or issued. Nothing was approved or sent.`;
}

/**
 * Said when an approval is refused because of what missingForCharity found: "Approve all" and approving one receipt
 * (or correcting it and approving it) say the same thing.
 */
export function charityMissingRefusal(missing: string[]): string {
  const it = missing.length === 1 ? "it" : "them";
  return `${charityMissingWords(missing)} Send ${it} to us and we'll add ${it}, then approve again.`;
}

/**
 * Givezy's own words (admin pages only) for what missingForCharity found, and how to put it right (review
 * 21/11/2026): the SARS reference number is saved in the s18A receipts box on the charity's admin page; the address
 * has no admin form yet (docs/go-live-checklist.md, section B).
 * "The charity's SARS reference number and address are missing from its record, and SARS needs both ..."
 */
export function adminCharityMissingWords(missing: string[]): string {
  if (!missing.length) return "";
  const one = missing.length === 1;
  const said = `The charity's ${andList(missing.map((m) => m.replace(/^the charity's /, "")))} ${one ? "is" : "are"} missing from its record, and SARS needs ${one ? "it" : missing.length === 2 ? "both" : "them all"} on every s18A receipt.`;
  const fixes: string[] = [];
  if (missing.includes(CHARITY_REFERENCE)) fixes.push(`Add the s18A reference number from the SARS letter in the s18A receipts box on the charity's page (Charities), then press Save.`);
  const rest = missing.filter((m) => m !== CHARITY_REFERENCE);
  if (rest.length) {
    fixes.push(
      fixes.length
        ? `There's no form for the ${andList(rest.map((m) => m.replace(/^the charity's /, "")))} yet: ask the developer to correct it in the database.`
        : "There's no form for this yet: ask the developer to correct it in the database.",
    );
  }
  return [said, ...fixes].join(" ");
}

export function buildReceiptDetails(args: {
  charity: CharityRow;
  donor: DonorRow;
  donations: { paidAt: string; amountCents: number; id?: string; recordedMethod?: string | null; paymentChannel?: string | null }[];
  taxYear: number;
  periodStart: string; // yyyy-mm-dd
  periodEnd: string; // yyyy-mm-dd
  issuedAt: Date;
}): ReceiptDetails {
  const { charity: c, donor: d } = args;
  const fmt = (iso: string) => iso.split("-").reverse().join("/");
  const period = `${fmt(args.periodStart)} to ${fmt(args.periodEnd)}`;
  const name = receiptDonorName(d);
  const sorted = [...args.donations].sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime());
  return {
    charity: {
      legal_name_en: c.legal_name_en,
      npo_number: c.npo_number,
      pbo_number: c.pbo_number,
      s18a_reference: c.s18a_reference,
      address: lines(c.address_line1, c.address_line2, c.suburb, c.city, c.postal_code),
    },
    donor: {
      donor_type: d.donor_type,
      name,
      registration_number: d.donor_type === "individual" ? null : d.registration_number,
      id_number_last4: d.id_number_last4,
      tax_reference_last4: d.tax_reference_last4,
      address: lines(d.address_line1, d.address_line2, d.suburb, d.city, d.postal_code),
    },
    donations: sorted.map((x) => ({
      date: formatDate(x.paidAt),
      amount_cents: x.amountCents,
      ...(x.id ? { reference: donationReference(x.id) } : {}),
      nature: donationNature(x.recordedMethod, x.paymentChannel),
    })),
    tax_year: args.taxYear,
    period,
    wording: {
      title: receiptConfig.wording.title,
      // Function replacers: a "$" in a charity's legal name is printed as typed, never read as a pattern.
      statement: receiptConfig.wording.statement.replaceAll("{charity}", () => c.legal_name_en).replaceAll("{period}", () => period),
    },
    issued_on: formatDate(args.issuedAt),
  };
}
