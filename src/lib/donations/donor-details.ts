/**
 * The give form's rules that need no zod (25/11/2026): the server runs them after its schema, and the website's give
 * form runs them when Give is pressed, so every problem shows at once in Givezy's words before anything is sent (a
 * journey walk-through found name and email waited for the server, after the bot check). The server stays the
 * authority: what passes here is checked again there.
 */
import { SA_PHONE } from "@/lib/phone";
import { saIdProblem } from "@/lib/sa-id";
import { passesModulus10 } from "@/lib/sars-numbers";
import { parseDedication } from "./dedication";
import { ADDRESS_MESSAGES, postalCodeProblem, registrationNumberProblem, SARS_LIMITS, sarsAddressProblems, sarsLengthProblem, sarsTextProblem } from "./s18a-rules";

/** The fields these rules read, as typed or as the server's schema left them. */
export type DonorDetailsInput = {
  donor_type: "individual" | "company" | "trust";
  wants_18a?: string;
  s18a_when?: string;
  first_name?: string;
  last_name?: string;
  organisation_name?: string;
  contact_person?: string;
  registration_number?: string;
  phone?: string;
  address_line1?: string;
  address_line2?: string;
  suburb?: string;
  city?: string;
  postal_code?: string;
  id_number?: string;
  tax_reference?: string;
  dedication_kind?: string;
  dedication_name?: string;
  monthly?: string;
  monthly_authorised?: string;
  age_confirmed?: string;
  popia_consent?: string;
};

/** Field errors for rules that depend on other fields. Empty object = fine. */
export function checkDonorDetails(v: DonorDetailsInput, receiptsAvailable: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  const want18a = receiptsAvailable && v.wants_18a === "on";
  // "Add my details after paying": the gift goes ahead without them (the receipt waits until they are added).
  const detailsNow = want18a && !s18aDetailsLater(v, receiptsAvailable);

  // With an s18A receipt, the names go on the receipt and in the charity's SARS file: only what that file can hold
  // is taken (23/11/2026). Without one, names stay exactly as typed.
  if (v.donor_type === "individual") {
    if (!v.first_name) e.first_name = "Enter your first name";
    else if (!hasLetter(v.first_name)) e.first_name = "Enter your first name in letters";
    else if (want18a) {
      const odd = sarsTextProblem(v.first_name, "name");
      if (odd) e.first_name = odd;
    }
    if (!v.last_name) e.last_name = "Enter your surname";
    else if (!hasLetter(v.last_name)) e.last_name = "Enter your surname in letters";
    else if (want18a) {
      const odd = sarsTextProblem(v.last_name, "name");
      if (odd) e.last_name = odd;
    }
  } else {
    if (!v.organisation_name) e.organisation_name = "Enter the registered name";
    else if (want18a) {
      const odd = sarsLengthProblem(v.organisation_name, SARS_LIMITS.organisationName, "the registered name") ?? sarsTextProblem(v.organisation_name, "organisation");
      if (odd) e.organisation_name = odd;
    }
    if (!v.contact_person) e.contact_person = "Enter a contact person";
    else if (!hasLetter(v.contact_person)) e.contact_person = "Enter the contact person's name in letters";
    const reg = registrationNumberProblem(v.donor_type, v.registration_number, { want18a, detailsNow });
    if (reg) e.registration_number = reg;
  }

  if (v.phone && !SA_PHONE.test(v.phone)) e.phone = "Use a South African number, e.g. 082 123 4567";

  // s18A details: the donor's address (section 18A(2) asks for the donor's name and address on the receipt; the
  // receipt job refuses one without it), and a person's SA ID number, which SARS needs to report the receipt
  // (decided 03/11/2026: the ID number is required, the income tax number optional).
  if (detailsNow) {
    if (!v.address_line1) e.address_line1 = ADDRESS_MESSAGES.streetEmpty;
    if (!v.city) e.city = ADDRESS_MESSAGES.cityEmpty;
    const postal = postalCodeProblem(v.postal_code);
    if (postal) e.postal_code = postal;
    // What SARS's file can't hold: too long, or a character it can't hold (23/11/2026).
    for (const [k, m] of Object.entries(sarsAddressProblems(v))) e[k] ??= m;
    if (v.donor_type === "individual") {
      // What is wrong with the number, in plain words (23/11/2026), the same as in the app.
      const id = saIdProblem(v.id_number ?? "");
      if (id) e.id_number = id;
    }
    const tax = v.tax_reference?.replace(/\s/g, "");
    if (tax && !/^\d{10}$/.test(tax)) e.tax_reference = "Income tax numbers are 10 digits";
    else if (tax && !passesModulus10(tax)) e.tax_reference = "That income tax number doesn't look right. Check the 10 digits, or leave it empty";
  }

  const dedication = parseDedication(v.dedication_kind, v.dedication_name);
  if (dedication && "error" in dedication) e.dedication_name = dedication.error;

  if (v.monthly === "on" && v.monthly_authorised !== "on") e.monthly_authorised = "Please confirm you authorise the monthly payments";
  if (v.age_confirmed !== "on") e.age_confirmed = "You must be 18 or older to give";
  if (v.popia_consent !== "on") e.popia_consent = "Please agree so we can record your donation";
  return e;
}

/**
 * A person's name has at least one letter, in any script (22/11/2026): "---", "1234" or emoji alone are not a name,
 * and would end up on the charity's records and the s18A receipt.
 */
export function hasLetter(name: string): boolean {
  return /\p{L}/u.test(name);
}

/** The donor asked for an s18A receipt and chose to add the details after paying. */
export function s18aDetailsLater(v: Pick<DonorDetailsInput, "wants_18a" | "s18a_when">, receiptsAvailable: boolean): boolean {
  return receiptsAvailable && v.wants_18a === "on" && v.s18a_when === "later";
}

/**
 * The website's single agreement tick (platformConfig.checkout.singleAgreementTick): one box, "agreement", stands
 * for both the age tick and the Terms, Privacy and sharing tick, so the same agreements are recorded either way.
 * With the switch off the two ticks are read as before and a stray "agreement" is ignored.
 */
export function applyAgreementTick(raw: Record<string, string | undefined>, singleTick: boolean): Record<string, string | undefined> {
  const { agreement, ...rest } = raw;
  if (!singleTick) return rest;
  const agreed = agreement === "on" ? "on" : undefined;
  return { ...rest, age_confirmed: agreed, popia_consent: agreed };
}

/** With the single tick, a missing age or agreement tick is one problem, on the one box. */
export const AGREEMENT_ERROR = "Please tick this box to give. You must be 18 or older, and we need your agreement to record your donation";
export function agreementErrors(fieldErrors: Record<string, string>, singleTick: boolean): Record<string, string> {
  if (!singleTick || !(fieldErrors.age_confirmed || fieldErrors.popia_consent)) return fieldErrors;
  const { age_confirmed: _a, popia_consent: _p, ...rest } = fieldErrors;
  void _a;
  void _p;
  return { ...rest, agreement: AGREEMENT_ERROR };
}

/** The email shape the give form checks before sending; the server's own check stays the authority. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/**
 * What the website's give form can tell before Give sends anything (25/11/2026): the same messages the server would
 * give for empty or impossible fields, all at once. Values are trimmed first, as a person means them. With "use my
 * ID ending 1234" the s18A details come from the earlier gift, so those checks wait for the server, as there.
 */
export function givePrecheck(
  typed: Record<string, string | undefined>,
  opts: { receiptsAvailable: boolean; singleTick: boolean },
): Record<string, string> {
  const raw: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(typed)) raw[k] = typeof v === "string" && v.trim() ? v.trim() : undefined;
  const v = applyAgreementTick(raw, opts.singleTick) as DonorDetailsInput & Record<string, string | undefined>;
  if (v.donor_type !== "company" && v.donor_type !== "trust") v.donor_type = "individual";
  const usingSavedId = raw.use_saved_id === "on";
  const e: Record<string, string> = {};
  if (!v.email || !EMAIL_SHAPE.test(v.email)) e.email = "Enter a valid email address";
  for (const [k, m] of Object.entries(checkDonorDetails(v, opts.receiptsAvailable && !usingSavedId))) e[k] ??= m;
  return agreementErrors(e, opts.singleTick);
}
