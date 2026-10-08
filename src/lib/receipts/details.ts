/**
 * The snapshot of everything printed on a receipt. It is stored with the
 * receipt, so the PDF can always be reproduced exactly, whatever happens to
 * the charity's or donor's records later.
 */
import { receiptConfig } from "@/config/receipts";
import { formatDate } from "@/lib/dates";

export type CharityRow = {
  legal_name_en: string;
  legal_name_he: string | null;
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

export type ReceiptDetails = {
  charity: {
    legal_name_en: string;
    legal_name_he: string | null;
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
  donations: { date: string; amount_cents: number }[];
  tax_year: number;
  period: string;
  wording: { title: string; statement: string };
  issued_on: string;
};

const lines = (...parts: (string | null | undefined)[]) => parts.map((p) => p?.trim()).filter((p): p is string => Boolean(p));

export function buildReceiptDetails(args: {
  charity: CharityRow;
  donor: DonorRow;
  donations: { paidAt: string; amountCents: number }[];
  taxYear: number;
  periodStart: string; // yyyy-mm-dd
  periodEnd: string; // yyyy-mm-dd
  issuedAt: Date;
}): ReceiptDetails {
  const { charity: c, donor: d } = args;
  const fmt = (iso: string) => iso.split("-").reverse().join("/");
  const period = `${fmt(args.periodStart)} to ${fmt(args.periodEnd)}`;
  const name =
    d.donor_type === "individual"
      ? lines(d.first_name, d.last_name).join(" ")
      : (d.organisation_name ?? "").trim();
  const sorted = [...args.donations].sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime());
  return {
    charity: {
      legal_name_en: c.legal_name_en,
      legal_name_he: c.legal_name_he,
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
    donations: sorted.map((x) => ({ date: formatDate(x.paidAt), amount_cents: x.amountCents })),
    tax_year: args.taxYear,
    period,
    wording: {
      title: receiptConfig.wording.title,
      statement: receiptConfig.wording.statement.replace("{charity}", c.legal_name_en).replace("{period}", period),
    },
    issued_on: formatDate(args.issuedAt),
  };
}
