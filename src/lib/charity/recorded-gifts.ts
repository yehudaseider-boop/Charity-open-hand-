/**
 * Gifts a charity records itself (21/10/2026): EFT, cash, a debit order or another programme, typed in one at
 * a time or imported from a CSV file. Pure: no database, no clock (the caller passes "today"). Every rule here
 * says what is wrong in plain words; nothing is guessed. An amount or a date that could be read two ways is
 * refused with how to write it, never read one way silently.
 */
import { platformConfig } from "@/config/platform";
import { taxYearFor } from "@/lib/dates";
import { formatRand, parseRandToCents, usesCommaThousands } from "@/lib/money";
import { isValidSaIdNumber } from "@/lib/sa-id";

export const RECORDED_METHODS = {
  eft: "EFT (bank transfer)",
  cash: "Cash",
  debit_order: "Debit order",
  other_programme: "Another giving programme",
  other: "Other",
} as const;
export type RecordedMethod = keyof typeof RECORDED_METHODS;
export const isRecordedMethod = (s: unknown): s is RecordedMethod => typeof s === "string" && s in RECORDED_METHODS;

/** The most rows one file may hold, and its largest size: a bigger file is split in two. */
export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_BYTES = 1_000_000;

/** One gift as typed or read from a file: every field a string, as it arrived. */
export type GiftFields = Partial<Record<GiftField, string>>;
export type GiftField =
  | "date" | "amount" | "method" | "donor_type" | "first_name" | "last_name" | "organisation_name" | "registration_number"
  | "email" | "phone" | "wants_18a" | "id_number" | "tax_reference" | "address_line1" | "address_line2" | "suburb" | "city"
  | "postal_code" | "campaign" | "reference";

/** A gift that passed every check, ready to record. */
export type CleanGift = {
  /** yyyy-mm-dd */
  date: string;
  amountCents: number;
  method: RecordedMethod;
  donorType: "individual" | "company" | "trust";
  firstName: string | null;
  lastName: string | null;
  organisationName: string | null;
  registrationNumber: string | null;
  email: string;
  phone: string | null;
  wants18a: boolean;
  idNumber: string | null;
  taxReference: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  suburb: string | null;
  city: string | null;
  postalCode: string | null;
  /** The campaign's title as typed (matched to one of the charity's campaigns by the caller). */
  campaign: string | null;
  reference: string | null;
};

export type GiftCheck = { ok: true; gift: CleanGift } | { ok: false; errors: Partial<Record<GiftField, string>> };

/** One line of text: line breaks, control and direction characters become spaces, then trimmed. */
function oneLine(v: string | undefined, max: number): string | null {
  if (v === undefined) return null;
  const s = v.replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

/**
 * An amount from a person or a bank file, in cents. "1250", "1 250", "R1 250.50", "1250,50", "1,250.00" and
 * "1.250,00" are clear. "1,250" and "1.250" are not (R1 250 or R1.25?), so they are refused with how to write them.
 */
export function parseGiftAmount(raw: string | undefined): { cents: number } | { error: string } {
  const s = (raw ?? "").trim().replace(/^R\s*/i, "").replace(/[\s ]/g, "");
  if (!s) return { error: "Amount missing" };
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  let normal = s;
  if (lastComma >= 0 && lastDot >= 0) {
    // Both marks: the last one is the decimal mark and the other separates thousands.
    normal = lastDot > lastComma ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  } else if (usesCommaThousands(s) || /\d\.\d{3}$/.test(s) || /\d\.\d{3}\./.test(s)) {
    return { error: `"${raw?.trim()}" could be read two ways. Write it as 1250 or 1250.00` };
  }
  const cents = parseRandToCents(normal);
  if (cents === null) return { error: `"${raw?.trim()}" isn't an amount we can read. Write it as 1250 or 1250.00` };
  if (cents <= 0) return { error: "The amount must be more than R0" };
  if (cents > platformConfig.maxDonationCents) return { error: `Over ${formatRand(platformConfig.maxDonationCents)}: please check it, or tell us and we'll add it` };
  return { cents };
}

/** A date written dd/mm/yyyy (SA), d/m/yyyy or yyyy-mm-dd, as yyyy-mm-dd. Never in the future. */
export function parseGiftDate(raw: string | undefined, today: string): { date: string } | { error: string } {
  const s = (raw ?? "").trim();
  if (!s) return { error: "Date missing" };
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return { error: `"${s}" isn't a date we can read. Write it as dd/mm/yyyy, for example 05/03/2026` };
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return { error: `"${s}" isn't a real date (dd/mm/yyyy)` };
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (iso > today) return { error: `${s} is in the future` };
  if (y < 2000) return { error: `${s} is too long ago to record` };
  return { date: iso };
}

/** Could this dd/mm date also be read mm/dd? (Both parts 12 or under, and different.) */
export function dateReadsBothWays(raw: string | undefined): boolean {
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{4}$/.exec((raw ?? "").trim());
  return Boolean(match && Number(match[1]) <= 12 && Number(match[2]) <= 12 && match[1] !== match[2]);
}

const YES = new Set(["yes", "y", "true", "1", "on", "ja"]);
const NO = new Set(["", "no", "n", "false", "0", "off", "nee"]);

function parseMethod(raw: string | undefined, fallback: RecordedMethod | null): RecordedMethod | null {
  const s = (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!s) return fallback;
  if (isRecordedMethod(s)) return s;
  const words: Record<string, RecordedMethod> = { bank: "eft", transfer: "eft", bank_transfer: "eft", debit: "debit_order", debitorder: "debit_order", programme: "other_programme", program: "other_programme" };
  return words[s] ?? null;
}

/**
 * Check one gift. `fallbackMethod` is the method chosen for the whole file, used where a row leaves it out.
 * `today` is yyyy-mm-dd in Johannesburg time.
 */
export function checkGift(f: GiftFields, opts: { today: string; fallbackMethod?: RecordedMethod | null }): GiftCheck {
  const e: Partial<Record<GiftField, string>> = {};
  const date = parseGiftDate(f.date, opts.today);
  if ("error" in date) e.date = date.error;
  const amount = parseGiftAmount(f.amount);
  if ("error" in amount) e.amount = amount.error;
  const method = parseMethod(f.method, opts.fallbackMethod ?? null);
  if (!method) e.method = f.method?.trim() ? `"${f.method.trim()}" isn't a way of giving we know. Use EFT, cash, debit order, other programme or other` : "Choose how the gift came in";

  const typeRaw = (f.donor_type ?? "").trim().toLowerCase();
  const donorType = typeRaw === "" || typeRaw === "individual" || typeRaw === "person" ? "individual" : typeRaw === "company" ? "company" : typeRaw === "trust" ? "trust" : null;
  if (!donorType) e.donor_type = "Donor type is individual, company or trust";

  const firstName = oneLine(f.first_name, 80), lastName = oneLine(f.last_name, 80);
  const organisationName = oneLine(f.organisation_name, 200), registrationNumber = oneLine(f.registration_number, 40);
  if (donorType === "individual") {
    if (!firstName) e.first_name = "First name missing";
    if (!lastName) e.last_name = "Surname missing";
  } else if (donorType && !organisationName) e.organisation_name = "Organisation name missing";

  const email = (f.email ?? "").trim().toLowerCase();
  if (!email) e.email = "Email missing (we send the s18A receipt there)";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) e.email = `"${f.email?.trim()}" isn't an email address`;

  const phoneRaw = (f.phone ?? "").replace(/[\s()-]/g, "");
  const phone = phoneRaw || null;
  if (phone && !/^(\+27|0)\d{9}$/.test(phone)) e.phone = "Use a South African number, e.g. 082 123 4567";

  const s18aRaw = (f.wants_18a ?? "").trim().toLowerCase();
  const wants18a = YES.has(s18aRaw);
  if (!wants18a && !NO.has(s18aRaw)) e.wants_18a = 'Write "yes" or "no" for the s18A receipt';

  const idNumber = (f.id_number ?? "").replace(/\s/g, "") || null;
  const taxReference = (f.tax_reference ?? "").replace(/\s/g, "") || null;
  const addressLine1 = oneLine(f.address_line1, 200), city = oneLine(f.city, 80);
  const postalCode = (f.postal_code ?? "").trim() || null;
  if (idNumber && !isValidSaIdNumber(idNumber)) e.id_number = "That isn't a valid SA ID number";
  if (taxReference && !/^\d{10}$/.test(taxReference)) e.tax_reference = "Income tax numbers are 10 digits";
  if (postalCode && !/^\d{4}$/.test(postalCode)) e.postal_code = "Postal codes are 4 digits";
  if (wants18a) {
    // What SARS needs on the receipt (section 18A(2)): the donor's name and address, and who they are.
    if (!addressLine1) e.address_line1 = "Street address missing (needed on the s18A receipt)";
    if (!city) e.city = "City or town missing (needed on the s18A receipt)";
    if (!postalCode) e.postal_code = "Postal code missing (needed on the s18A receipt)";
    if (donorType === "individual" && !idNumber && !taxReference) e.id_number = "An SA ID number or income tax number is needed for the s18A receipt";
    if (donorType && donorType !== "individual" && !registrationNumber) e.registration_number = "Registration number missing (needed on the s18A receipt)";
  }

  if (Object.keys(e).length) return { ok: false, errors: e };
  return {
    ok: true,
    gift: {
      date: (date as { date: string }).date,
      amountCents: (amount as { cents: number }).cents,
      method: method!,
      donorType: donorType!,
      firstName: donorType === "individual" ? firstName : null,
      lastName: donorType === "individual" ? lastName : null,
      organisationName: donorType === "individual" ? null : organisationName,
      registrationNumber: donorType === "individual" ? null : registrationNumber,
      email,
      phone,
      wants18a,
      idNumber: wants18a ? idNumber : null,
      taxReference: wants18a ? taxReference : null,
      addressLine1: wants18a ? addressLine1 : null,
      addressLine2: wants18a ? oneLine(f.address_line2, 200) : null,
      suburb: wants18a ? oneLine(f.suburb, 80) : null,
      city: wants18a ? city : null,
      postalCode: wants18a ? postalCode : null,
      campaign: oneLine(f.campaign, 120),
      reference: oneLine(f.reference, 100),
    },
  };
}

/** The noon of a gift's date in Johannesburg, as the moment it was paid (clear of any time-zone edge). */
export function paidAtOf(date: string): string {
  return `${date}T12:00:00+02:00`;
}

/** The tax year a recorded gift falls in. */
export const taxYearOfGift = (date: string) => taxYearFor(paidAtOf(date));

// ---------------------------------------------------------------------------------------------------------
// Files

/** Read CSV text into rows of cells (quotes, doubled quotes, commas, semicolons and line breaks in quotes). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  // Excel in South Africa often saves with semicolons: use whichever the header line has more of.
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Column headings we understand, in plain words, with the other ways people write them. */
const HEADINGS: Record<GiftField, string[]> = {
  date: ["date", "gift date", "donation date", "transaction date", "datum"],
  amount: ["amount", "amount (r)", "rand", "value", "donation", "bedrag"],
  method: ["method", "how", "payment method", "type of payment", "channel"],
  donor_type: ["donor type", "type"],
  first_name: ["first name", "firstname", "name", "given name"],
  last_name: ["surname", "last name", "lastname", "family name"],
  organisation_name: ["organisation", "organization", "company", "organisation name", "company name", "trust name"],
  registration_number: ["registration number", "reg number", "company registration"],
  email: ["email", "e-mail", "email address"],
  phone: ["phone", "cell", "mobile", "phone number", "cellphone"],
  wants_18a: ["s18a", "18a", "s18a receipt", "wants s18a", "section 18a"],
  id_number: ["id number", "sa id", "id", "identity number"],
  tax_reference: ["tax number", "income tax number", "tax reference"],
  address_line1: ["address", "street address", "address line 1", "address 1"],
  address_line2: ["address line 2", "address 2"],
  suburb: ["suburb"],
  city: ["city", "town", "city or town"],
  postal_code: ["postal code", "postcode", "code", "zip"],
  campaign: ["campaign", "appeal", "project"],
  reference: ["reference", "ref", "bank reference", "transaction reference"],
};

/** The headings of the template file, in order. */
export const TEMPLATE_HEADINGS = ["Date", "Amount", "Method", "Donor type", "First name", "Surname", "Organisation", "Registration number", "Email", "Phone", "s18A", "ID number", "Tax number", "Address", "Address line 2", "Suburb", "City", "Postal code", "Campaign", "Reference"];

/** Which column holds which field. Unknown columns are listed so the person sees what was left out. */
export function mapHeadings(header: string[]): { columns: Partial<Record<GiftField, number>>; unknown: string[]; missing: GiftField[] } {
  const columns: Partial<Record<GiftField, number>> = {};
  const unknown: string[] = [];
  header.forEach((raw, i) => {
    const h = raw.trim().toLowerCase().replace(/\s+/g, " ");
    const field = (Object.keys(HEADINGS) as GiftField[]).find((f) => HEADINGS[f].includes(h));
    if (field && columns[field] === undefined) columns[field] = i;
    else if (h) unknown.push(raw.trim());
  });
  const missing = (["date", "amount", "email"] as GiftField[]).filter((f) => columns[f] === undefined);
  return { columns, unknown, missing };
}

export type RowResult = { line: number; fields: GiftFields; check: GiftCheck; duplicateOf?: string };
export type FileCheck =
  | { ok: false; message: string }
  | { ok: true; rows: RowResult[]; unknownColumns: string[]; good: number; bad: number; totalCents: number; datesReadBothWays: boolean };

/** Read and check a whole file. `seen` holds keys of gifts already recorded (see giftKey), to spot repeats. */
export function checkFile(text: string, opts: { today: string; fallbackMethod: RecordedMethod | null; seen?: Set<string> }): FileCheck {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, message: "This file is over 1 MB. Split it into smaller files and import them one at a time." };
  const all = parseCsv(text);
  if (all.length < 2) return { ok: false, message: "This file has no gifts in it: we need a heading row and at least one gift." };
  const { columns, unknown, missing } = mapHeadings(all[0]);
  if (missing.length) {
    const names: Record<string, string> = { date: "Date", amount: "Amount", email: "Email" };
    return { ok: false, message: `We couldn't find the ${missing.map((m) => names[m]).join(", ")} column. Use the headings in our template (download it below).` };
  }
  if (all.length - 1 > MAX_IMPORT_ROWS) return { ok: false, message: `This file has ${all.length - 1} gifts. Import at most ${MAX_IMPORT_ROWS} at a time: split it into smaller files.` };
  const seen = new Set(opts.seen ?? []);
  const rows: RowResult[] = all.slice(1).map((cells, i) => {
    const fields: GiftFields = {};
    for (const [f, col] of Object.entries(columns) as [GiftField, number][]) fields[f] = cells[col] ?? "";
    const check = checkGift(fields, { today: opts.today, fallbackMethod: opts.fallbackMethod });
    const r: RowResult = { line: i + 2, fields, check };
    if (check.ok) {
      const key = giftKey(check.gift);
      if (seen.has(key)) r.duplicateOf = key;
      seen.add(key);
    }
    return r;
  });
  const good = rows.filter((r) => r.check.ok && !r.duplicateOf);
  return {
    ok: true,
    rows,
    unknownColumns: unknown,
    good: good.length,
    bad: rows.length - good.length,
    totalCents: good.reduce((t, r) => t + (r.check.ok ? r.check.gift.amountCents : 0), 0),
    // No date in the file settles which part is the day (none over 12), and some could be read either way.
    datesReadBothWays: !rows.some((r) => Number(/^(\d{1,2})[/.-]\d{1,2}[/.-]\d{4}$/.exec((r.fields.date ?? "").trim())?.[1] ?? 0) > 12) && rows.some((r) => dateReadsBothWays(r.fields.date)),
  };
}

/**
 * What makes a recorded gift "the same one" as another: the charity's own reference when there is one, else
 * the donor's email, the amount and the date. A second file with the same gifts is caught this way.
 */
export function giftKey(g: { reference: string | null; email: string; amountCents: number; date: string }): string {
  return g.reference ? `ref:${g.reference.toLowerCase()}` : `gift:${g.email.toLowerCase()}|${g.amountCents}|${g.date}`;
}
