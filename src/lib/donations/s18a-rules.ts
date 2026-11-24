import { isValidCompanyRegistration } from "../sars-numbers";
/**
 * What SARS's IT3(d) file can hold, checked where a donor types their s18A details (tester, 23/11/2026): at checkout
 * on the website and in the app, and on the "add my s18A details" form. Until now a name with "ễ", a 150-character
 * street address or a 16-character trust number was accepted, and only blocked the charity's SARS file after the
 * receipt was issued. The character rule is the one the IT3(d) builder uses (src/lib/receipts/it3d.ts imports it from
 * here), so the two never drift. Checked only when an s18A receipt is wanted: names typed for a gift without one stay
 * as they are.
 *
 * Shared with the phone app: dependency-free (see CLAUDE.md).
 */

/**
 * The first character SARS's IT3(d) file can't hold, or null: outside Latin-1, or a control character that would
 * break a line. (The file's field separator "|" is checked on its own, by sarsTextProblem and the file builder.)
 */
export function sarsFileBadCharacter(v: string): string | null {
  for (const ch of v) {
    const c = ch.codePointAt(0)!;
    if (c > 0xff || c < 0x20 || (c >= 0x7f && c <= 0x9f)) return ch;
  }
  return null;
}

/** The longest values the IT3(d) file holds for a donor (field numbers from SARS's BRS). */
export const SARS_LIMITS = {
  /** Fields 425 to 428: each address line, the suburb, and the city or town. */
  addressLine: 100,
  /** Field 407: a company's or trust's registered name (a person's surname). */
  organisationName: 120,
  /** Field 412: the donor's ID or registration number, a trust's number from the Master of the High Court included
   * (it3d.ts). 15 is only the charity's own limit as the reporting entity (field 309), not a donor's. */
  trustNumber: 30,
} as const;

export type SarsTextKind = "name" | "organisation" | "address";

/** A letter outside Latin-1 that is a Latin-1 letter with an accent added (ễ is ê with a dot): its plain letter. */
function plainLetterOf(ch: string): string | null {
  const base = ch.normalize("NFD").replace(/\p{M}+/gu, "");
  return base && sarsFileBadCharacter(base) === null && /\p{L}/u.test(base) ? base : null;
}

/**
 * What stops SARS's receipt file holding this value, in words a donor can act on, or null. The value is checked as
 * it is kept (composed, NFC), so an "é" typed as e plus an accent is fine. For example:
 * SARS's receipt file can't hold "ễ". Please type it as it appears on your ID document, without that letter's accent.
 */
export function sarsTextProblem(value: string | null | undefined, kind: SarsTextKind): string | null {
  const v = (value ?? "").normalize("NFC");
  if (v.includes("|")) return `SARS's receipt file can't hold "|". Please use another character.`;
  const odd = sarsFileBadCharacter(v);
  if (!odd) return null;
  const shown = /\s/.test(odd) || odd.codePointAt(0)! < 0x20 ? "a hidden character" : `"${odd}"`;
  const as = kind === "name" ? " as it appears on your ID document," : kind === "organisation" ? " as it is registered," : "";
  if (plainLetterOf(odd)) return `SARS's receipt file can't hold ${shown}. Please type it${as} without that letter's accent.`;
  if (/\p{L}/u.test(odd)) return `SARS's receipt file can't hold ${shown}. Please type it in Latin letters${as.replace(/,$/, "")}.`;
  return `SARS's receipt file can't hold ${shown}. Please leave it out.`;
}

/** A value longer than SARS's file holds, said plainly; null when it fits. `what` is "the street address", for example. */
export function sarsLengthProblem(value: string | null | undefined, max: number, what: string): string | null {
  const n = [...(value ?? "").trim()].length;
  return n > max ? `SARS's receipt file holds at most ${max} characters for ${what}. Please shorten it (it has ${n}).` : null;
}

/** A trust number longer than SARS takes. */
export function trustNumberProblem(value: string | null | undefined): string | null {
  const n = [...(value ?? "").trim()].length;
  return n > SARS_LIMITS.trustNumber
    ? `A trust number is at most ${SARS_LIMITS.trustNumber} characters for SARS (this one has ${n}). Check it against the letter from the Master of the High Court.`
    : null;
}

/** The address boxes' messages, the same on the website and in the app (23/11/2026). */
export const ADDRESS_MESSAGES = {
  streetEmpty: "Enter your street address. SARS needs it on the receipt",
  cityEmpty: "Enter your city or town",
  postalEmpty: "Enter your postal code",
  postalNotFourDigits: "Postal codes are 4 digits",
} as const;

/** A South African postal code: 4 digits. The message, or null when it is fine. */
export function postalCodeProblem(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return ADDRESS_MESSAGES.postalEmpty;
  return /^\d{4}$/.test(v) ? null : ADDRESS_MESSAGES.postalNotFourDigits;
}

export type S18aAddress = { address_line1?: string | null; address_line2?: string | null; suburb?: string | null; city?: string | null };

const ADDRESS_FIELDS: [keyof S18aAddress, string][] = [
  ["address_line1", "the street address"],
  ["address_line2", "the unit, complex or building"],
  ["suburb", "the suburb"],
  ["city", "the city or town"],
];

/**
 * The address boxes SARS's file can't hold as typed (too long, or a character it can't hold), by field name. Only
 * what is typed is checked: whether a box may be empty is the form's own rule.
 */
export function sarsAddressProblems(a: S18aAddress): Partial<Record<keyof S18aAddress, string>> {
  const e: Partial<Record<keyof S18aAddress, string>> = {};
  for (const [field, what] of ADDRESS_FIELDS) {
    const v = a[field];
    if (!v) continue;
    const problem = sarsLengthProblem(v, SARS_LIMITS.addressLine, what) ?? sarsTextProblem(v, "address");
    if (problem) e[field] = problem;
  }
  return e;
}

/**
 * What is wrong with a company's or trust's registration number at checkout, or null. SARS reports a company by its
 * CIPC number (Appendix K) and a trust by its Master's number (decided 03/11/2026), at most 15 characters
 * (23/11/2026). The give form runs it again when the donor switches between "A company" and "A trust", so a
 * company's message never stays on a trust's number (tester, 23/11/2026).
 */
export function registrationNumberProblem(
  donorType: "individual" | "company" | "trust",
  value: string | null | undefined,
  s18a: { want18a: boolean; detailsNow: boolean },
  today: Date = new Date(),
): string | null {
  if (donorType === "individual") return null;
  const reg = value?.trim() ?? "";
  if (s18a.detailsNow && !reg) return "Needed for an s18A receipt";
  if (s18a.want18a && reg && donorType === "company" && !isValidCompanyRegistration(reg, today)) return "Use the company's CIPC number, for example 2015/123456/07";
  if (s18a.detailsNow && donorType === "trust") return trustNumberProblem(reg);
  return null;
}
