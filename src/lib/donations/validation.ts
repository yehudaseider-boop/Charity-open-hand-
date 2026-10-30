import { z } from "zod";
import { isValidSaIdNumber } from "@/lib/sa-id";
import { cleanDedicationName, parseDedication } from "./dedication";
import { cleanLabel } from "./labels";

/** An optional text field, with a plain message when it is too long. */
const str = (max: number, what: string) => z.string().max(max, `Please keep ${what} to ${max} characters or fewer`).optional();
/**
 * A one-line field (a name, an address line): line breaks, control and direction characters become
 * spaces. These are printed in emails and on receipts, where a typed line break could pass off extra text.
 */
const line = (max: number, what: string) => str(max, what).transform((v) => (v === undefined ? v : cleanDedicationName(v)));
const yes = z.literal("on").optional();

/** The old fixed choice, still accepted from older app versions and links (read as a label). */
export const givingKinds = { maaser: "Maaser", chomesh: "Chomesh", tzedaka: "Tzedaka" } as const;

/** Checkout form, as sent. Cross-field rules are applied in checkDonorDetails. */
export const checkoutSchema = z.object({
  donor_type: z.enum(["individual", "company", "trust"]),
  email: z.email("Enter a valid email address"),
  first_name: line(80, "your first name"),
  last_name: line(80, "your surname"),
  organisation_name: line(200, "the name"),
  registration_number: line(40, "the registration number"),
  contact_person: line(120, "the contact person"),
  phone: str(20, "the phone number"),
  wants_18a: yes,
  id_number: str(20, "the ID number"),
  tax_reference: str(20, "the income tax number"),
  address_line1: line(200, "the street address"),
  address_line2: line(200, "this line"),
  suburb: line(80, "the suburb"),
  city: line(80, "the city or town"),
  postal_code: z.string().max(4, "Postal codes are 4 digits").optional(),
  message: str(500, "your message"),
  /** Optional: given in honour of, or in memory of, someone (the name is checked in checkDonorDetails). */
  dedication_kind: z.enum(["none", "honour", "memory"]).optional(),
  dedication_name: str(80, "their name"),
  /** The donor's own label for this gift, optional and private to them ("Work giving", "Family"). */
  giving_label: str(80, "your label"),
  /** Older app versions send the fixed choice instead; it becomes the label. */
  giving_kind: z.enum(["maaser", "chomesh", "tzedaka"]).optional(),
  is_anonymous: yes,
  /** "Don't send me news or appeals from this charity" (POPIA: the donor can say no when giving). */
  no_news: yes,
  /** Give this amount every month until the donor cancels. */
  monthly: yes,
  monthly_authorised: yes,
  age_confirmed: yes,
  popia_consent: yes,
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Field errors for rules that depend on other fields. Empty object = fine. */
export function checkDonorDetails(v: CheckoutInput, receiptsAvailable: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  const want18a = receiptsAvailable && v.wants_18a === "on";

  if (v.donor_type === "individual") {
    if (!v.first_name) e.first_name = "Enter your first name";
    if (!v.last_name) e.last_name = "Enter your surname";
  } else {
    if (!v.organisation_name) e.organisation_name = "Enter the registered name";
    if (!v.contact_person) e.contact_person = "Enter a contact person";
    if (want18a && !v.registration_number) e.registration_number = "Needed for an s18A receipt";
  }

  if (v.phone && !/^(\+27|0)\d{9}$/.test(v.phone)) e.phone = "Use a South African number, e.g. 082 123 4567";

  // s18A details: an ID or income tax number, and the donor's address (section 18A(2) asks for the
  // donor's name and address on the receipt; the receipt job refuses one without it).
  if (want18a) {
    if (!v.address_line1) e.address_line1 = "Enter your street address. SARS needs it on the receipt";
    if (!v.city) e.city = "Enter your city or town";
    if (!v.postal_code) e.postal_code = "Enter your postal code";
    else if (!/^\d{4}$/.test(v.postal_code)) e.postal_code = "Postal codes are 4 digits";
    if (v.donor_type === "individual") {
      if (!v.id_number && !v.tax_reference) e.id_number = "Enter your SA ID number or income tax number";
      if (v.id_number && !isValidSaIdNumber(v.id_number)) e.id_number = "That doesn't look like a valid SA ID number";
    }
    if (v.tax_reference && !/^\d{10}$/.test(v.tax_reference)) e.tax_reference = "Income tax numbers are 10 digits";
  }

  const dedication = parseDedication(v.dedication_kind, v.dedication_name);
  if (dedication && "error" in dedication) e.dedication_name = dedication.error;

  if (v.monthly === "on" && v.monthly_authorised !== "on") e.monthly_authorised = "Please confirm you authorise the monthly payments";
  if (v.age_confirmed !== "on") e.age_confirmed = "You must be 18 or older to give";
  if (v.popia_consent !== "on") e.popia_consent = "Please agree so we can record your donation";
  return e;
}

export function cleanPhone(v: string | undefined) {
  return v?.replace(/[\s()-]/g, "") || undefined;
}

/** The label to keep with a gift: what the donor typed, else an older app's fixed choice. */
export function givingLabelOf(v: Pick<CheckoutInput, "giving_label" | "giving_kind">): string | null {
  return cleanLabel(v.giving_label) ?? (v.giving_kind ? givingKinds[v.giving_kind] : null);
}
