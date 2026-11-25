import { z } from "zod";
import { normaliseSaPhone } from "@/lib/phone";
import { saIdDigits } from "@/lib/sa-id";
import { plainPunctuation } from "@/lib/plain-text";
import { normaliseLineBreaks } from "@/lib/text";
// Moved to s18a-rules.ts (24/11/2026) so the give form need not load zod just to run it; still exported from here.
export { registrationNumberProblem };
import { cleanDedicationName } from "./dedication";
import { AGREEMENT_ERROR, agreementErrors, applyAgreementTick, checkDonorDetails, hasLetter, s18aDetailsLater } from "./donor-details";
export { AGREEMENT_ERROR, agreementErrors, applyAgreementTick, checkDonorDetails, hasLetter, s18aDetailsLater };
import { cleanLabel, LABEL_MAX } from "./labels";
import { registrationNumberProblem } from "./s18a-rules";

/** An optional text field, with a plain message when it is too long. */
const str = (max: number, what: string) => z.string().max(max, `Please keep ${what} to ${max} characters or fewer`).optional();
/**
 * A one-line field (a name, an address line): line breaks, control and direction characters become
 * spaces. These are printed in emails and on receipts, where a typed line break could pass off extra text.
 * Typographic quotes, dashes and odd spaces become plain ones first (20/11/2026): a phone's O’Brien would
 * otherwise block the charity's SARS file, which holds Latin-1 only. Made plain before the length is checked, and
 * composed (NFC: an "é" typed as e plus an accent is kept as the one letter "é", which the file can hold).
 */
const line = (max: number, what: string) =>
  z
    .preprocess((v) => (typeof v === "string" ? plainPunctuation(v).normalize("NFC") : v), z.string().max(max, `Please keep ${what} to ${max} characters or fewer`))
    .optional()
    .transform((v) => (v === undefined ? v : cleanDedicationName(v)));
/** A text box (more than one line): a line break counts as one character, as the browser's maxLength counts it. */
const box = (max: number, what: string) =>
  z.preprocess((v) => (typeof v === "string" ? normaliseLineBreaks(v) : v), z.string().max(max, `Please keep ${what} to ${max} characters or fewer`)).optional();
const yes = z.literal("on").optional();

/** The old fixed choice, still accepted from older app versions and links (read as a label). */

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
  /**
   * With an s18A receipt: give the details now, or "Add my details after paying" (decided 04/11/2026). After
   * paying, the ID or registration number and the address are added on the thank-you page or from the account.
   */
  s18a_when: z.enum(["now", "later"]).optional(),
  /** Kept without spaces or dashes: "850101-5009-087" is 8501015009087. */
  id_number: str(20, "the ID number").transform((v) => (v === undefined ? v : saIdDigits(v) || undefined)),
  tax_reference: str(20, "the income tax number"),
  address_line1: line(200, "the street address"),
  address_line2: line(200, "this line"),
  suburb: line(80, "the suburb"),
  city: line(80, "the city or town"),
  postal_code: z.string().max(4, "Postal codes are 4 digits").optional(),
  message: box(500, "your message"),
  /** Optional: given in honour of, or in memory of, someone (the name is checked in checkDonorDetails). */
  dedication_kind: z.enum(["none", "honour", "memory"]).optional(),
  dedication_name: str(80, "their name"),
  /** The donor's own label for this gift, optional and private to them ("Work giving", "Family"). */
  giving_label: str(LABEL_MAX, "your label"),
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

/** The phone as kept: the same rule as the charity's forms and imports (src/lib/phone.ts). */
export function cleanPhone(v: string | undefined) {
  return v === undefined ? undefined : normaliseSaPhone(v) || undefined;
}

/** The label to keep with a gift: what the donor typed. An older app's fixed choice (giving_kind) is accepted but never kept as a label. */
export function givingLabelOf(v: Pick<CheckoutInput, "giving_label" | "giving_kind">): string | null {
  return cleanLabel(v.giving_label);
}
