import { z } from "zod";
import { isValidSaIdNumber } from "@/lib/sa-id";

const str = (max = 200) => z.string().max(max).optional();
const yes = z.literal("on").optional();

/** What a gift is counted as in the donor's own records. The donor must choose; there is no default. */
export const givingKinds = { maaser: "Maaser", chomesh: "Chomesh", tzedaka: "General tzedaka" } as const;

/** Checkout form, as sent. Cross-field rules are applied in checkDonorDetails. */
export const checkoutSchema = z.object({
  donor_type: z.enum(["individual", "company", "trust"]),
  email: z.email("Enter a valid email address"),
  first_name: str(80),
  last_name: str(80),
  organisation_name: str(),
  registration_number: str(40),
  contact_person: str(120),
  phone: str(20),
  wants_18a: yes,
  id_number: str(20),
  tax_reference: str(20),
  address_line1: str(),
  address_line2: str(),
  suburb: str(80),
  city: str(80),
  postal_code: str(4),
  message: str(500),
  giving_kind: z.enum(["maaser", "chomesh", "tzedaka"], { error: "Choose maaser, chomesh or general tzedaka" }),
  is_anonymous: yes,
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
    if (want18a && !v.registration_number) e.registration_number = "Needed for an 18A receipt";
  }

  if (v.phone && !/^(\+27|0)\d{9}$/.test(v.phone)) e.phone = "Use a South African number, e.g. 082 123 4567";

  // s18A details: an ID or income tax number only, for now. Address and phone
  // are left out until Yehuda confirms what an s18A receipt must show.
  if (want18a) {
    if (v.donor_type === "individual") {
      if (!v.id_number && !v.tax_reference) e.id_number = "Enter your SA ID number or income tax number";
      if (v.id_number && !isValidSaIdNumber(v.id_number)) e.id_number = "That doesn't look like a valid SA ID number";
    }
    if (v.tax_reference && !/^\d{10}$/.test(v.tax_reference)) e.tax_reference = "Income tax numbers are 10 digits";
  }

  if (v.age_confirmed !== "on") e.age_confirmed = "You must be 18 or older to give";
  if (v.popia_consent !== "on") e.popia_consent = "Please agree so we can record your donation";
  return e;
}

export function cleanPhone(v: string | undefined) {
  return v?.replace(/[\s()-]/g, "") || undefined;
}
