/**
 * The IT3(d) data file for SARS (s18A donations), and the same values for the eFiling capture sheet (03/11/2026).
 * Built from SARS's BRS "IT3 Data Submission" v4.0.0D-10, copied in docs/sars/it3d-spec.md; every choice the BRS
 * leaves open is in docs/sars/it3d-decisions.md. Pure: inputs in, { lines, problems, totals } out, no database
 * and no clock (the caller passes "now"). Money is whole cents.
 *
 * One file holds one charity: it is the submitting entity (SE) and the only reporting entity (RE) (Yehuda,
 * 02/11/2026). Records, in this order: GH, SE, the RE, every donor (DE), every donation (DR), the trailer (T).
 * Nothing is ever shortened or changed silently: a value SARS's file can't hold is a problem to fix.
 */
import { centsToRandDecimal } from "@/lib/money";
import { isoDateInJhb, taxYearRange, zonedParts } from "@/lib/dates";
import {
  DONOR_TAX_REFERENCE_FIRST_DIGITS,
  ENTITY_TAX_REFERENCE_FIRST_DIGITS,
  dateOfBirthFromSaId,
  isValidCompanyRegistration,
  isValidTaxReference,
  normaliseCompanyRegistration,
  passesSaIdCheck,
} from "@/lib/sars-numbers";

/** The SARS "Nature of person" codes a charity may choose (Appendix A, p.246; field 306 rules out the rest). */
export const LEGAL_FORMS = [
  { code: "OTHER_CO", label: "Other company" },
  { code: "INTERVIVOS_TRUST", label: "Trust (any type)" },
  { code: "ASSOC_NOT_FOR_GAIN", label: "Association not for gain" },
  { code: "UNINCORPORATED_BODY_OF_PERSONS", label: "Other entity" },
  { code: "GOVERNMENT_ENTITY", label: "Government entity" },
] as const;
export type LegalForm = (typeof LEGAL_FORMS)[number]["code"];
export const isLegalForm = (s: unknown): s is LegalForm => LEGAL_FORMS.some((f) => f.code === s);

export type It3dPeriod = "first_half" | "full_year";
export const PERIOD_LABELS: Record<It3dPeriod, string> = { first_half: "First six months", full_year: "Full tax year" };

/** The period's first and last day, yyyy-mm-dd: 1 March to 31 August, or 1 March to the end of February. */
export function it3dPeriodRange(taxYear: number, period: It3dPeriod): { start: string; end: string } {
  const year = taxYearRange(taxYear);
  return period === "first_half" ? { start: year.start, end: `${taxYear - 1}-08-31` } : year;
}

export type Address = { line1: string | null; line2: string | null; suburb: string | null; city: string | null; postalCode: string | null };

export type It3dCharity = {
  id: string;
  legalName: string;
  tradingName: string;
  legalForm: LegalForm | null;
  registrationNumber: string | null;
  taxReference: string | null;
  pboNumber: string | null;
  address: Address;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
};

export type It3dDonor = {
  type: "individual" | "company" | "trust";
  firstName: string | null;
  lastName: string | null;
  organisationName: string | null;
  registrationNumber: string | null;
  /** The full numbers, decrypted on the server. They only ever leave in the downloaded files. */
  idNumber: string | null;
  taxReference: string | null;
  phone: string | null;
  email: string | null;
  address: Address;
  /**
   * The donor asked for their information to be erased. Since 09/11/2026 a gift on an issued s18A receipt keeps
   * what SARS needs (names, ID, tax and registration numbers, address); only the contact details are gone. An
   * erasure from before that left nothing: that receipt is left out of the file, to be captured by hand.
   */
  erased: boolean;
  /** The gifts on this one receipt carry different ID numbers (should never happen). */
  idNumbersDiffer?: boolean;
};

export type It3dReceipt = {
  receiptId: string;
  /** The s18A receipt's own number, as printed on it. */
  receiptNumber: string | null;
  /** Stable for the same donor identity at this charity, never the ID number itself (see the loader). */
  donorKey: string;
  donor: It3dDonor;
  donations: { id: string; paidAt: string; amountCents: number; recordedMethod: string | null }[];
};

export type It3dInput = {
  taxYear: number;
  period: It3dPeriod;
  now: Date;
  testData: boolean;
  /** Field 10, typed by the person downloading. Empty when only checking or making the capture sheet. */
  sourceIdentifier: string;
  sourceSystemVersion: string;
  uniqueFileId: string;
  charity: It3dCharity;
  receipts: It3dReceipt[];
};

/** Where a problem is fixed: the SARS details on the page, the contact details, or by asking Givezy. */
export type FixAt = "sars_details" | "contact" | "support" | null;

export type It3dProblem = {
  severity: "blocking" | "warning";
  message: string;
  fix: FixAt;
  receiptNumber?: string | null;
  donorName?: string;
  /** The last four digits of the donor's ID or registration number, to tell people apart on the page. */
  idLast4?: string | null;
};

export type It3dTotals = { receipts: number; donors: number; donations: number; totalCents: number };

/** One donation as the IT3-01 form asks for it, for the capture sheet, with the problems on it. */
export type It3dSheetRow = { values: string[]; problems: string[]; blocking: boolean };

export type It3dResult = {
  lines: string[];
  fileName: string;
  problems: It3dProblem[];
  totals: It3dTotals;
  /** No donations in the period: no file can be built (field 604 must be at least 0.01). */
  nil: boolean;
  /** The data file can be downloaded: there are donations and no blocking problems. */
  fileReady: boolean;
  sheet: { entity: [string, string][]; header: string[]; rows: It3dSheetRow[]; amountColumn: number };
};

export const NO_PHONE = "999999999999999";
export const NO_EMAIL = "NO@EMAIL.COM";
export const SOURCE_SYSTEM = "Givezy";
export const SOURCE_IDENTIFIER_LENGTH = 144;

const ID_TYPES = { "001": "South African ID number", "004": "South African company/ close corporation registration number", "007": "South African trust registration number" } as const;
const NATURE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Individual",
  PRIVATE_CO: "Unlisted company",
  INTERVIVOS_TRUST: "Trust (any type)",
  OTHER_CO: "Other company",
  ASSOC_NOT_FOR_GAIN: "Association not for gain",
  UNINCORPORATED_BODY_OF_PERSONS: "Other entity",
  GOVERNMENT_ENTITY: "Government entity",
};

/** Message Create Date (field 3), Johannesburg time, CCYY-MM-DDThh:mm:ss, 24-hour clock. */
export function messageCreateDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

/** The file name (p.20): I3D_1_<SE tax reference>_<Unique File ID>_<CCYYMMDDThhmmss>.psv */
export function it3dFileName(taxReference: string, uniqueFileId: string, now: Date): string {
  return `I3D_1_${taxReference}_${uniqueFileId}_${messageCreateDate(now).replace(/[-:]/g, "")}.psv`;
}

/** SA phone numbers as SARS wants them: digits only, national starting 0, international starting 00. Null when not usable. */
export function sarsPhone(raw: string | null | undefined): { digits: string; cell: boolean } | null {
  let s = (raw ?? "").replace(/[\s()./-]/g, "");
  if (s.startsWith("+27")) s = `0${s.slice(3)}`;
  else if (s.startsWith("+")) s = `00${s.slice(1)}`;
  if (!/^0\d{8,14}$/.test(s)) return null;
  // SA cell numbers start 06, 07 or 08; an international number is taken as a cell phone.
  return { digits: s, cell: /^0[678]/.test(s) || s.startsWith("00") };
}

/** SARS's email rule (fields 21, 225, 328, 432): one @, a domain with a dot, 5 to 80 characters. */
export function sarsEmailOk(raw: string | null | undefined): boolean {
  const s = (raw ?? "").trim();
  return s.length >= 5 && s.length <= 80 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

/** Initials (field 408): the first letter of each given name. Names (409): the given names, one space apart. */
export function initialsAndNames(firstName: string | null): { initials: string; names: string } {
  const words = (firstName ?? "").trim().split(/\s+/).filter(Boolean);
  return { initials: words.map((w) => [...w][0].toUpperCase()).join(""), names: words.join(" ") };
}

/** Physical address fields 314 to 320 and 418 to 424 (unit, complex, street number, street, suburb, city, code): empty, we send the postal address. */
const PHYSICAL_ADDRESS_MAX = [8, 27, 8, 27, 36, 36, 10];

const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+$/, "");
const last4 = (v: string | null | undefined) => (v ? v.replace(/\s/g, "").slice(-4) : null);

type Field = { no: number; value: string; max: number; label: string; /** Where this one field is fixed, when not where the record's other fields are. */ fix?: FixAt };
type Who = { receiptNumber?: string | null; donorName?: string; idLast4?: string | null; fix?: FixAt };

/** Characters the file can't hold: outside Latin-1, or control characters that would break a line. */
function badCharacter(v: string): string | null {
  for (const ch of v) {
    const c = ch.codePointAt(0)!;
    if (c > 0xff || c < 0x20 || (c >= 0x7f && c <= 0x9f)) return ch;
  }
  return null;
}

/** What the charity is told about a receipt left out because the donor was erased before the SARS details were kept. */
export const ERASED_LEFT_OUT =
  "This donor's details were erased at their request before Givezy kept what SARS needs, so this receipt is left out of the file. The rest of the file can still go. Capture this receipt by hand on eFiling from your own records, or ask your accountant.";

/** An erased donor without the details SARS needs: names, the ID or registration number, and an address. */
export function erasedWithoutSarsDetails(d: It3dDonor): boolean {
  if (!d.address.line1?.trim()) return true;
  if (d.type === "individual") return !d.lastName?.trim() || !d.firstName?.trim() || !d.idNumber?.trim();
  return !d.organisationName?.trim() || !d.registrationNumber?.trim();
}

export function buildIt3d(input: It3dInput): It3dResult {
  const { charity: c, taxYear } = input;
  const problems: It3dProblem[] = [];
  const add = (severity: It3dProblem["severity"], message: string, who: Who = {}) => {
    const { fix = null, ...rest } = who;
    if (!problems.some((p) => p.message === message && p.receiptNumber === rest.receiptNumber)) problems.push({ severity, message, fix, ...rest });
  };
  const block = (message: string, who?: Who) => add("blocking", message, who);
  const warn = (message: string, who?: Who) => add("warning", message, who);

  /** Every value SARS gets: trailing spaces trimmed; a pipe, leading space, odd character or too long is a problem. */
  const record = (fields: Field[], who: Who, sheetProblems?: string[]): string => {
    return fields
      .map((f) => {
        const v = clean(f.value);
        const say = (m: string) => {
          block(m, f.fix === undefined ? who : { ...who, fix: f.fix });
          sheetProblems?.push(m);
        };
        if (v.includes("|")) say(`${f.label} has a "|" in it, which SARS's file can't hold. Change it to another character.`);
        if (/^\s/.test(v)) say(`${f.label} starts with a space. Remove the space.`);
        const odd = badCharacter(v);
        if (odd) say(`${f.label} has a character SARS's file can't hold ("${odd}"). Change it to a plain letter.`);
        if ([...v].length > f.max) say(`${f.label} is ${[...v].length} characters long. SARS takes at most ${f.max}. Shorten it.`);
        return v;
      })
      .join("|");
  };

  // ---- The period and the donations in it (Date Paid must fall inside the tax year, field 509).
  const range = it3dPeriodRange(taxYear, input.period);
  const inPeriod = (paidAt: string) => {
    const d = isoDateInJhb(new Date(paidAt));
    return d >= range.start && d <= range.end;
  };
  const inPeriodReceipts = input.receipts
    .map((r) => ({ ...r, donations: r.donations.filter((d) => inPeriod(d.paidAt)).sort((a, b) => a.paidAt.localeCompare(b.paidAt) || a.id.localeCompare(b.id)) }));
  const receipts = inPeriodReceipts
    .filter((r) => r.donations.length > 0)
    .sort((a, b) => (a.receiptNumber ?? "").localeCompare(b.receiptNumber ?? "", "en", { numeric: true }) || a.receiptId.localeCompare(b.receiptId));
  // A receipt for this tax year with gifts, none of them paid in the year, is odd for the full year (in the first
  // six months it is expected: the gifts came later). Said, never dropped quietly.
  if (input.period === "full_year") {
    inPeriodReceipts.forEach((r, i) => {
      if (input.receipts[i].donations.length > 0 && r.donations.length === 0) warn(`Receipt ${r.receiptNumber ?? "(no number)"} has no donations in this tax year. Check its tax year.`, { receiptNumber: r.receiptNumber });
    });
  }
  const currentYear = zonedParts(input.now).year;

  // ---- The charity (submitting and reporting entity).
  const taxRef = (c.taxReference ?? "").replace(/\s/g, "");
  const toDetails: Who = { fix: "sars_details" };
  if (!taxRef) block("Add your charity's income tax reference number.", toDetails);
  else if (!isValidTaxReference(taxRef, ENTITY_TAX_REFERENCE_FIRST_DIGITS)) block("Your charity's income tax reference number doesn't pass SARS's check. Check the 10 digits.", toDetails);
  if (!c.legalForm) block("Choose your charity's legal form, as SARS has you registered.", toDetails);
  if (!c.pboNumber?.trim()) block("Your charity's PBO (exemption) number is missing. Ask Givezy to add it.", { fix: "support" });
  if (!c.address.line1?.trim() || !c.address.postalCode?.trim()) block("Your charity's postal address or postal code is missing. Ask Givezy to add it.", { fix: "support" });
  const contactWords = (c.contactName ?? "").trim().split(/\s+/).filter(Boolean);
  if (contactWords.length < 2) block("Add your contact person's first name and surname. SARS asks for both.", { fix: "contact" });
  const contactPhone = sarsPhone(c.contactPhone);
  if (!contactPhone) block("Add your contact person's phone number (a South African number, for example 011 123 4567).", { fix: "contact" });
  if (!sarsEmailOk(c.contactEmail)) block("Add your contact person's email address.", { fix: "contact" });

  // Identification of the submitting entity (fields 211 and 212): a company by its CIPC number, a trust by its trust number.
  let seIdType = "";
  let seIdNumber = "";
  const reg = (c.registrationNumber ?? "").trim();
  if (c.legalForm === "OTHER_CO") {
    seIdType = "004";
    seIdNumber = normaliseCompanyRegistration(reg);
    if (!reg) block("Add your charity's CIPC company registration number. SARS needs it to identify your charity.", toDetails);
    else if (!isValidCompanyRegistration(reg, input.now, currentYear)) block("Your charity's company registration number isn't in SARS's format (for example 2015/123456/08). Check it.", toDetails);
  } else if (c.legalForm === "INTERVIVOS_TRUST") {
    seIdType = "007";
    seIdNumber = reg;
    if (!reg) block("Add your charity's trust registration number from the Master of the High Court.", toDetails);
  } else if (c.legalForm) {
    block("SARS needs an identification number for the submitting entity. Ask your accountant which number to use.");
  }

  const contactFirst = contactWords.slice(0, -1).join(" ");
  const contactSurname = contactWords.at(-1) ?? "";
  const contactEmail = (c.contactEmail ?? "").trim();
  const entityTel = contactPhone && !contactPhone.cell ? contactPhone.digits : "";
  const entityCell = contactPhone?.cell ? contactPhone.digits : NO_PHONE;
  const entityEmail = sarsEmailOk(contactEmail) ? contactEmail : NO_EMAIL;
  const reUnique = `RE-${c.id}-${taxYear}`;
  const chWho: Who = { fix: "support" };

  const gh = record([
    { no: 1, value: "H", max: 1, label: "" },
    { no: 2, value: "GH", max: 3, label: "" },
    { no: 3, value: messageCreateDate(input.now), max: 19, label: "The date" },
    { no: 4, value: "1", max: 4, label: "" },
    { no: 5, value: input.uniqueFileId, max: 64, label: "The file's number", fix: null },
    { no: 6, value: "", max: 0, label: "" },
    { no: 7, value: input.testData ? "T" : "L", max: 1, label: "" },
    { no: 8, value: "I3D", max: 3, label: "" },
    { no: 9, value: "HTTPS", max: 10, label: "" },
    { no: 10, value: input.sourceIdentifier, max: SOURCE_IDENTIFIER_LENGTH, label: "The Source Identifier", fix: null },
    { no: 14, value: SOURCE_SYSTEM, max: 30, label: "" },
    { no: 15, value: input.sourceSystemVersion, max: 10, label: "Givezy's version", fix: null },
    { no: 16, value: contactFirst, max: 100, label: "Your contact person's first name" },
    { no: 17, value: contactSurname, max: 120, label: "Your contact person's surname" },
    { no: 18, value: contactPhone?.digits ?? "", max: 15, label: "Your contact phone number" },
    { no: 19, value: "", max: 15, label: "" },
    { no: 20, value: contactPhone?.cell ? contactPhone.digits : "", max: 15, label: "Your contact phone number" },
    { no: 21, value: contactEmail, max: 80, label: "Your contact email address" },
  ], { fix: "contact" });

  const se = record([
    { no: 201, value: "H", max: 1, label: "" },
    { no: 202, value: "SE", max: 3, label: "" },
    { no: 203, value: String(taxYear), max: 4, label: "" },
    { no: 204, value: range.start, max: 10, label: "" },
    { no: 205, value: range.end, max: 10, label: "" },
    { no: 206, value: c.legalForm ?? "", max: 33, label: "" },
    { no: 207, value: c.legalName, max: 120, label: "Your charity's registered name" },
    { no: 208, value: "", max: 0, label: "" },
    { no: 209, value: "", max: 0, label: "" },
    { no: 210, value: c.tradingName, max: 120, label: "Your charity's name" },
    { no: 211, value: seIdType, max: 3, label: "" },
    { no: 212, value: seIdNumber, max: 30, label: "Your charity's registration number" },
    { no: 213, value: "", max: 0, label: "" },
    { no: 214, value: "", max: 50, label: "" },
    { no: 215, value: "", max: 30, label: "" },
    { no: 216, value: taxRef, max: 10, label: "Your charity's income tax reference number" },
    { no: 217, value: "", max: 6, label: "" },
    { no: 218, value: c.address.line1 ?? "", max: 100, label: "Your charity's address line 1" },
    { no: 219, value: c.address.line2 ?? "", max: 100, label: "Your charity's address line 2" },
    { no: 220, value: c.address.suburb ?? "", max: 100, label: "Your charity's suburb" },
    { no: 221, value: c.address.city ?? "", max: 100, label: "Your charity's city or town" },
    { no: 222, value: c.address.postalCode ?? "", max: 10, label: "Your charity's postal code" },
    { no: 223, value: entityTel, max: 15, label: "" },
    { no: 224, value: entityCell, max: 15, label: "" },
    { no: 225, value: entityEmail, max: 80, label: "" },
  ], chWho);

  if (c.legalForm === "INTERVIVOS_TRUST" && reg.length > 15) block(`Your charity's trust number is ${reg.length} characters long. SARS takes at most 15 for a reporting entity. Check it.`, toDetails);
  const reRegistration = c.legalForm === "OTHER_CO" ? seIdNumber : reg;
  if (c.legalForm !== "INTERVIVOS_TRUST" && reRegistration.length > 15) block("Registration number is longer than SARS allows (15 characters). Check it.", toDetails);
  const re = record([
    { no: 301, value: "B", max: 1, label: "" },
    { no: 302, value: "RE", max: 6, label: "" },
    { no: 303, value: "N", max: 1, label: "" },
    { no: 304, value: reUnique, max: 100, label: "" },
    { no: 305, value: "1", max: 10, label: "" },
    { no: 306, value: c.legalForm ?? "", max: 33, label: "" },
    { no: 307, value: c.legalName, max: 120, label: "Your charity's registered name" },
    { no: 308, value: c.tradingName, max: 120, label: "Your charity's name" },
    { no: 309, value: reRegistration.length <= 15 ? reRegistration : "", max: 15, label: "Your charity's registration number" },
    { no: 310, value: "", max: 50, label: "" },
    { no: 311, value: "", max: 30, label: "" },
    { no: 312, value: taxRef, max: 10, label: "" },
    { no: 313, value: c.pboNumber ?? "", max: 100, label: "Your charity's PBO number" },
    ...[314, 315, 316, 317, 318, 319, 320].map((no, i) => ({ no, value: "", max: PHYSICAL_ADDRESS_MAX[i], label: "" })),
    { no: 321, value: c.address.line1 ?? "", max: 100, label: "Your charity's address line 1" },
    { no: 322, value: c.address.line2 ?? "", max: 100, label: "Your charity's address line 2" },
    { no: 323, value: c.address.suburb ?? "", max: 100, label: "Your charity's suburb" },
    { no: 324, value: c.address.city ?? "", max: 100, label: "Your charity's city or town" },
    { no: 325, value: c.address.postalCode ?? "", max: 10, label: "Your charity's postal code" },
    { no: 326, value: entityTel, max: 15, label: "" },
    { no: 327, value: entityCell, max: 15, label: "" },
    { no: 328, value: entityEmail, max: 80, label: "" },
    { no: 329, value: "N", max: 1, label: "" },
  ], chWho);
  if (c.address.postalCode && !/^[A-Za-z0-9. ]+$/.test(c.address.postalCode.trim())) block("Your charity's postal code can only have letters, numbers and spaces. Ask Givezy to correct it.", chWho);

  // ---- Donors (one DE per donor identity) and their donations (DR).
  type De = { unique: string; fields: Field[]; who: Who; sheet: string[]; sheetProblems: string[]; blocking: boolean };
  const donors = new Map<string, De>();
  const drs: { de: De; receiptNumber: string; donation: It3dReceipt["donations"][number] }[] = [];
  let companyDonor = false;
  /** Receipts whose donor was erased before the SARS details were kept: listed, not in the file. */
  const leftOut: It3dReceipt[] = [];

  for (const r of receipts) {
    const d = r.donor;
    const donorName = d.type === "individual" ? [d.firstName, d.lastName].filter(Boolean).join(" ").trim() : (d.organisationName ?? "").trim();
    const who: Who = { receiptNumber: r.receiptNumber, donorName: donorName || "A donor", idLast4: last4(d.type === "individual" ? d.idNumber : d.registrationNumber), fix: null };
    if (d.erased && erasedWithoutSarsDetails(d)) {
      // Only this receipt is affected: the rest of the file can still go to SARS.
      add("warning", ERASED_LEFT_OUT, who);
      leftOut.push(r);
      continue;
    }
    const before = problems.filter((p) => p.severity === "blocking").length;
    const own: string[] = [];
    const say = (sev: "blocking" | "warning", m: string) => {
      add(sev, m, who);
      own.push(m);
    };
    if (!r.receiptNumber) say("blocking", "This receipt has no receipt number. Ask Givezy to check it.");
    for (const g of r.donations) if (g.recordedMethod === "other") say("warning", 'A gift you recorded as "Other" is reported as money (CASH). If it was goods, report it as IN SPECIE on eFiling instead.');

    let existing = donors.get(r.donorKey);
    if (!existing) {
      let surname = "", initials = "", names = "", idType = "", idNumber = "", dob = "", nature = "";
      if (d.type === "individual") {
        nature = "INDIVIDUAL";
        idType = "001";
        surname = (d.lastName ?? "").trim();
        ({ initials, names } = initialsAndNames(d.firstName));
        if (!surname || !names) say("blocking", "This donor's first name or surname is missing. Ask Givezy to check the receipt.");
        const id = (d.idNumber ?? "").replace(/\s/g, "");
        if (!id) {
          say("blocking", d.taxReference
            ? "This donor gave only an income tax number. SARS needs an SA ID number to report the receipt. Ask the donor for it, then report this receipt on eFiling."
            : "This donor gave no SA ID number. SARS needs one to report the receipt. Ask the donor for it, then report this receipt on eFiling.");
        } else if (!passesSaIdCheck(id)) {
          say("blocking", "This donor's SA ID number doesn't pass SARS's check. Ask the donor to confirm it.");
        } else {
          idNumber = id;
          dob = dateOfBirthFromSaId(id, input.now, currentYear) ?? "";
          if (!dob) say("blocking", "This donor's SA ID number doesn't start with a real date of birth. Ask the donor to confirm it.");
        }
        if (d.idNumbersDiffer) say("blocking", "The gifts on this receipt carry different SA ID numbers. Ask Givezy to check it.");
      } else {
        surname = (d.organisationName ?? "").trim();
        if (!surname) say("blocking", "This donor's registered name is missing. Ask Givezy to check the receipt.");
        const regNo = (d.registrationNumber ?? "").trim();
        if (d.type === "company") {
          // Assumption (docs/sars/it3d-decisions.md): we don't ask whether a company is listed, so every company is reported as unlisted.
          nature = "PRIVATE_CO";
          idType = "004";
          companyDonor = true;
          own.push("Reported as an unlisted company (PRIVATE_CO). If it is listed or a close corporation, change the nature of person on eFiling.");
          idNumber = normaliseCompanyRegistration(regNo);
          if (!regNo) say("blocking", "This company gave no registration number. SARS needs its CIPC number to report the receipt.");
          else if (!isValidCompanyRegistration(regNo, input.now, currentYear)) say("blocking", "This company's registration number isn't in SARS's format (for example 2015/123456/07). Ask the donor to confirm it.");
        } else {
          nature = "INTERVIVOS_TRUST";
          idType = "007";
          idNumber = regNo;
          if (!regNo) say("blocking", "This trust gave no registration number. SARS needs its trust number to report the receipt.");
        }
      }

      let tax = (d.taxReference ?? "").replace(/\s/g, "");
      if (tax && !isValidTaxReference(tax, DONOR_TAX_REFERENCE_FIRST_DIGITS)) {
        say("warning", "This donor's income tax number doesn't pass SARS's check, so it is left out. SARS accepts the receipt without it for now.");
        tax = "";
      }

      const a = d.address;
      let postalCode = (a.postalCode ?? "").trim();
      if (!a.line1?.trim()) say("blocking", "This donor's address is missing. SARS needs a postal address. Ask Givezy to check the receipt.");
      else if (!postalCode) {
        postalCode = "0000";
        say("warning", 'This donor\'s postal code is missing, so it is sent as "0000", as SARS allows.');
      } else if (postalCode && !/^[A-Za-z0-9. ]+$/.test(postalCode)) say("blocking", "This donor's postal code can only have letters, numbers and spaces. Ask Givezy to check it.");
      const phone = d.erased ? null : sarsPhone(d.phone);
      const email = (d.email ?? "").trim();
      const tel = phone && !phone.cell ? phone.digits : "";
      const cell = phone?.cell ? phone.digits : NO_PHONE;
      const mail = sarsEmailOk(email) && !d.erased ? email : NO_EMAIL;
      if (email && !sarsEmailOk(email) && !d.erased) say("warning", `This donor's email address doesn't fit SARS's rules (at most 80 characters), so it is sent as ${NO_EMAIL}.`);

      // Unique within the section across all files (p.222): the tax year is in it, so next year's file never re-sends this year's number.
      const unique = `DE-${c.id}-${taxYear}-${r.donorKey}`;
      const fields: Field[] = [
        { no: 401, value: "B", max: 1, label: "" },
        { no: 402, value: "DE", max: 6, label: "" },
        { no: 403, value: "N", max: 1, label: "" },
        { no: 404, value: unique, max: 100, label: "The donor's number" },
        { no: 405, value: "", max: 10, label: "" }, // row number, set below
        { no: 406, value: reUnique, max: 100, label: "" },
        { no: 407, value: surname, max: 120, label: d.type === "individual" ? "The donor's surname" : "The donor's registered name" },
        { no: 408, value: initials, max: 30, label: "The donor's initials" },
        { no: 409, value: names, max: 100, label: "The donor's first names" },
        { no: 410, value: "", max: 120, label: "" },
        { no: 411, value: idType, max: 3, label: "" },
        { no: 412, value: idNumber, max: 30, label: d.type === "individual" ? "The donor's ID number" : "The donor's registration number" },
        { no: 413, value: "", max: 0, label: "" },
        { no: 414, value: tax, max: 10, label: "" },
        { no: 415, value: dob, max: 10, label: "" },
        { no: 416, value: "", max: 30, label: "" },
        { no: 417, value: nature, max: 33, label: "" },
        ...[418, 419, 420, 421, 422, 423, 424].map((no, i) => ({ no, value: "", max: PHYSICAL_ADDRESS_MAX[i], label: "" })),
        { no: 425, value: a.line1 ?? "", max: 100, label: "The donor's address line 1" },
        { no: 426, value: a.line2 ?? "", max: 100, label: "The donor's address line 2" },
        { no: 427, value: a.suburb ?? "", max: 100, label: "The donor's suburb" },
        { no: 428, value: a.city ?? "", max: 100, label: "The donor's city or town" },
        { no: 429, value: postalCode, max: 10, label: "The donor's postal code" },
        { no: 430, value: tel, max: 15, label: "" },
        { no: 431, value: cell, max: 15, label: "" },
        { no: 432, value: mail, max: 80, label: "The donor's email address" },
      ];
      const v = (no: number) => fields.find((f) => f.no === no)!.value;
      existing = {
        unique, fields, who, sheetProblems: own,
        blocking: false,
        // Columns after the four donation columns, in the IT3-01 form's order (see SHEET_HEADER).
        sheet: [
          surname, initials, names, idType ? `${idType} ${ID_TYPES[idType as keyof typeof ID_TYPES]}` : "", idNumber, tax,
          dob ? dob.split("-").reverse().join("/") : "", nature ? `${NATURE_LABELS[nature]} (${nature})` : "",
          v(425), v(426), v(427), v(428), v(429), tel, cell, mail,
        ],
      };
      donors.set(r.donorKey, existing);
    } else {
      existing.sheetProblems.push(...own);
    }
    if (problems.filter((p) => p.severity === "blocking").length > before) existing.blocking = true;
    for (const g of r.donations) drs.push({ de: existing, receiptNumber: r.receiptNumber ?? "", donation: g });
  }
  if (companyDonor) warn("Companies are reported as unlisted companies. If a donor is a listed company or close corporation, change it in the sheet before you submit.");

  // ---- Body rows: the RE, then every DE, then every DR (all of one kind together), numbered 1..n.
  const deList = [...donors.values()];
  const drOrdered = deList.flatMap((de) => drs.filter((x) => x.de === de));
  let row = 1;
  const deLines = deList.map((de) => {
    de.fields.find((f) => f.no === 405)!.value = String(++row);
    const before = de.sheetProblems.length;
    const line = record(de.fields, de.who, de.sheetProblems);
    if (de.sheetProblems.length > before) de.blocking = true;
    return line;
  });
  let totalCents = 0;
  const sheetRows: It3dSheetRow[] = [];
  const drLines = drOrdered.map(({ de, receiptNumber, donation }) => {
    totalCents += donation.amountCents;
    const datePaid = isoDateInJhb(new Date(donation.paidAt));
    const value = centsToRandDecimal(donation.amountCents);
    const rowProblems: string[] = [];
    const line = record([
      { no: 501, value: "B", max: 1, label: "" },
      { no: 502, value: "DR", max: 6, label: "" },
      { no: 503, value: "N", max: 1, label: "" },
      { no: 504, value: `DR-${donation.id}`, max: 100, label: "" },
      { no: 505, value: String(++row), max: 10, label: "" },
      { no: 506, value: de.unique, max: 100, label: "" },
      { no: 507, value: receiptNumber, max: 100, label: "The receipt number" },
      { no: 508, value: "CASH", max: 10, label: "" },
      { no: 509, value: datePaid, max: 10, label: "" },
      { no: 510, value, max: 18, label: "The amount" },
    ], de.who, rowProblems);
    sheetRows.push({
      values: [receiptNumber, "Cash", value, datePaid.split("-").reverse().join("/"), ...de.sheet],
      problems: [...new Set([...de.sheetProblems, ...rowProblems])],
      blocking: de.blocking || rowProblems.length > 0,
    });
    return line;
  });

  // A null declaration only when there were no receipts at all: receipts left out (erased donors) still exist.
  const nil = drLines.length === 0 && leftOut.length === 0;
  const bodyCount = 1 + deLines.length + drLines.length;
  const trailer = ["T", String(bodyCount), "", centsToRandDecimal(totalCents)].join("|");
  const lines = drLines.length === 0 ? [] : [gh, se, re, ...deLines, ...drLines, trailer];
  const totals: It3dTotals = { receipts: new Set(receipts.filter((r) => !leftOut.includes(r)).map((r) => r.receiptId)).size, donors: deList.length, donations: drLines.length, totalCents };
  const fileReady = drLines.length > 0 && !problems.some((p) => p.severity === "blocking");

  const entity: [string, string][] = [
    ["Tax year (SARS)", String(taxYear)],
    ["Period start date", range.start.split("-").reverse().join("/")],
    ["Period end date", range.end.split("-").reverse().join("/")],
    ["Nature of person", c.legalForm ? `${NATURE_LABELS[c.legalForm]} (${c.legalForm})` : ""],
    ["Registered name", c.legalName],
    ["Trading name", c.tradingName],
    ["Identification type", seIdType ? `${seIdType} ${ID_TYPES[seIdType as keyof typeof ID_TYPES]}` : ""],
    ["Identification number (registration number)", seIdNumber],
    ["Income tax reference number", taxRef],
    ["Exemption reference number (PBO number)", c.pboNumber ?? ""],
    ["Postal address line 1", c.address.line1 ?? ""],
    ["Postal address line 2", c.address.line2 ?? ""],
    ["Postal address line 3", c.address.suburb ?? ""],
    ["Postal address line 4", c.address.city ?? ""],
    ["Postal code", c.address.postalCode ?? ""],
    ["Telephone number", entityTel],
    ["Cell phone number", entityCell],
    ["Contact email", entityEmail],
    ["Contact person", [contactFirst, contactSurname].filter(Boolean).join(" ")],
    ["Null declaration", nil ? "Yes (no donations in this period)" : "No (donor records follow)"],
    ["Number of s18A receipts", String(totals.receipts)],
    ["Number of donors", String(totals.donors)],
    ["Number of donations", String(totals.donations)],
    ["Total of all donations (R)", centsToRandDecimal(totalCents)],
  ];

  return {
    lines,
    fileName: it3dFileName(taxRef, input.uniqueFileId, input.now),
    problems,
    totals,
    nil,
    fileReady,
    sheet: { entity, header: SHEET_HEADER, rows: sheetRows, amountColumn: 2 },
  };
}

/** The capture sheet's donation columns, in the order the IT3-01 form asks for them. */
export const SHEET_HEADER = [
  "Receipt number", "Nature of donation", "Rand value", "Date paid / transferred",
  "Donor surname / registered name", "Initials", "Names", "Identification type", "Identification number", "Income tax reference number",
  "Date of birth", "Nature of person", "Postal address line 1", "Postal address line 2", "Postal address line 3", "Postal address line 4",
  "Postal code", "Telephone number", "Cell phone number", "Contact email", "Problems to fix first",
];

/** The file's bytes: every record ends with CR LF (the trailer too), in Latin-1. */
export function it3dBytes(lines: string[]): Buffer {
  return Buffer.from(lines.map((l) => `${l}\r\n`).join(""), "latin1");
}
