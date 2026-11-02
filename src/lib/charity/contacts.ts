/**
 * A charity's own donor list, imported from a CSV file (02/11/2026): people who have not given through Givezy
 * yet. Pure: no database. Uses the same CSV reading and limits as the gift import (recorded-gifts.ts). One
 * file is all or nothing: every row must pass, or nothing is imported. Values are never guessed or cut: a
 * value that is too long, or a file whose columns could be read two ways, is refused with what to change.
 * Givezy never emails these people.
 */
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, parseCsv } from "./recorded-gifts";

export { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS };

export type ContactField =
  | "first_name" | "last_name" | "organisation_name" | "email" | "phone" | "address_line1" | "address_line2" | "suburb" | "city"
  | "postal_code" | "note" | "tags";
export type ContactFields = Partial<Record<ContactField, string>>;

export type CleanContact = {
  firstName: string | null;
  lastName: string | null;
  organisationName: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  suburb: string | null;
  city: string | null;
  postalCode: string | null;
  note: string | null;
  tags: string[];
};

export type ContactCheck = { ok: true; contact: CleanContact } | { ok: false; errors: Partial<Record<ContactField, string>> };

/** Most tags on one row, and the longest tag (the same as a tag typed on the dashboard). */
export const MAX_TAGS_PER_ROW = 10;
export const MAX_TAG_LENGTH = 40;
export const MAX_NOTE_LENGTH = 2000;

const LIMITS: Record<Exclude<ContactField, "email" | "phone" | "postal_code" | "tags" | "note">, [string, number]> = {
  first_name: ["First name", 80],
  last_name: ["Surname", 80],
  organisation_name: ["Organisation", 200],
  address_line1: ["Address", 200],
  address_line2: ["Address line 2", 200],
  suburb: ["Suburb", 80],
  city: ["City", 80],
};

/** One line of text: line breaks, control and direction characters become spaces, then trimmed. */
function oneLine(v: string | undefined): string | null {
  if (v === undefined) return null;
  const s = v.replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
  return s || null;
}

/** A note keeps its line breaks, but loses other control and direction characters. */
function noteText(v: string | undefined): string | null {
  if (v === undefined) return null;
  const s = v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f‎‏‪-‮⁦-⁩]/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return s || null;
}

/** Tags written in one cell, split on commas, semicolons or |. The same tag twice (any case) counts once. */
export function splitTags(raw: string | undefined): string[] {
  const out: string[] = [];
  for (const part of (raw ?? "").split(/[,;|]/)) {
    const t = oneLine(part);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

/** Check one row. */
export function checkContact(f: ContactFields): ContactCheck {
  const e: Partial<Record<ContactField, string>> = {};
  const text: Partial<Record<keyof typeof LIMITS, string | null>> = {};
  for (const [field, [label, max]] of Object.entries(LIMITS) as [keyof typeof LIMITS, [string, number]][]) {
    const v = oneLine(f[field]);
    if (v && v.length > max) e[field] = `${label} is over ${max} characters`;
    text[field] = v;
  }
  if (!text.first_name && !text.last_name && !text.organisation_name) e.first_name = "Name missing: add a first name and surname, or an organisation";

  const emailRaw = (f.email ?? "").trim();
  const email = emailRaw.toLowerCase() || null;
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) e.email = `"${emailRaw}" isn't an email address`;

  const phone = (f.phone ?? "").replace(/[\s()-]/g, "") || null;
  if (phone && !/^(\+27|0)\d{9}$/.test(phone)) e.phone = `"${(f.phone ?? "").trim()}" isn't a phone number we can read. Use a South African number, e.g. 082 123 4567`;

  const postalCode = (f.postal_code ?? "").trim() || null;
  if (postalCode && !/^\d{4}$/.test(postalCode)) e.postal_code = `"${postalCode}" isn't a postal code: they are 4 digits`;

  const note = noteText(f.note);
  if (note && note.length > MAX_NOTE_LENGTH) e.note = "The note is over 2 000 characters";

  const tags = splitTags(f.tags);
  const long = tags.find((t) => t.length > MAX_TAG_LENGTH);
  if (long) e.tags = `The tag "${long.slice(0, 20)}…" is over ${MAX_TAG_LENGTH} characters`;
  else if (tags.length > MAX_TAGS_PER_ROW) e.tags = `${tags.length} tags: one person can have at most ${MAX_TAGS_PER_ROW}`;

  if (Object.keys(e).length) return { ok: false, errors: e };
  return {
    ok: true,
    contact: {
      firstName: text.first_name ?? null,
      lastName: text.last_name ?? null,
      organisationName: text.organisation_name ?? null,
      email,
      phone,
      addressLine1: text.address_line1 ?? null,
      addressLine2: text.address_line2 ?? null,
      suburb: text.suburb ?? null,
      city: text.city ?? null,
      postalCode,
      note,
      tags,
    },
  };
}

/** The name shown on the list: the person's name, else the organisation's. */
export function contactName(c: { firstName?: string | null; lastName?: string | null; organisationName?: string | null; first_name?: string | null; last_name?: string | null; organisation_name?: string | null }): string {
  const person = [c.firstName ?? c.first_name, c.lastName ?? c.last_name].filter(Boolean).join(" ");
  return person || (c.organisationName ?? c.organisation_name ?? "");
}

// ---------------------------------------------------------------------------------------------------------
// Files

/** Column headings we understand, with the other ways people write them. */
const HEADINGS: Record<ContactField, string[]> = {
  first_name: ["first name", "firstname", "name", "given name"],
  last_name: ["surname", "last name", "lastname", "family name"],
  organisation_name: ["organisation", "organization", "company", "organisation name", "company name", "trust name"],
  email: ["email", "e-mail", "email address"],
  phone: ["phone", "cell", "mobile", "phone number", "cellphone"],
  address_line1: ["address", "street address", "address line 1", "address 1"],
  address_line2: ["address line 2", "address 2"],
  suburb: ["suburb"],
  city: ["city", "town", "city or town"],
  postal_code: ["postal code", "postcode", "code", "zip"],
  note: ["note", "notes", "comment", "comments"],
  tags: ["tags", "tag", "labels"],
};

/** The headings of the template file, in order. */
export const CONTACT_TEMPLATE_HEADINGS = ["First name", "Surname", "Organisation", "Email", "Phone", "Address", "Address line 2", "Suburb", "City", "Postal code", "Note", "Tags"];

/** Headings that belong to a gift file: a sign the person chose the wrong import. */
const GIFT_HEADINGS = ["amount", "amount (r)", "date", "gift date", "donation date", "transaction date"];

export type ContactHeadings = { columns: Partial<Record<ContactField, number>>; unknown: string[]; twice: string[][] };

/** Which column holds which field. Two columns for the same field can't be told apart, so they are reported. */
export function mapContactHeadings(header: string[]): ContactHeadings {
  const columns: Partial<Record<ContactField, number>> = {};
  const seen: Partial<Record<ContactField, string[]>> = {};
  const unknown: string[] = [];
  header.forEach((raw, i) => {
    const h = raw.trim().toLowerCase().replace(/\s+/g, " ");
    const field = (Object.keys(HEADINGS) as ContactField[]).find((f) => HEADINGS[f].includes(h));
    if (field) {
      seen[field] = [...(seen[field] ?? []), raw.trim()];
      if (columns[field] === undefined) columns[field] = i;
    } else if (h) unknown.push(raw.trim());
  });
  const twice = Object.values(seen).filter((names): names is string[] => Boolean(names && names.length > 1));
  return { columns, unknown, twice };
}

export type ContactRow = { line: number; check: ContactCheck };
export type ContactFileCheck =
  | { ok: false; message: string }
  | { ok: true; rows: ContactRow[]; unknownColumns: string[]; good: number; bad: number; looksLikeGifts: boolean; tagNames: string[] };

/**
 * Read and check a whole file. `existingEmails` holds the emails of contacts this charity already imported
 * (lower case), so the same person isn't imported twice.
 */
export function checkContactFile(text: string, opts: { existingEmails?: Set<string> } = {}): ContactFileCheck {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, message: "This file is over 1 MB. Split it into smaller files and import them one at a time." };
  const all = parseCsv(text);
  if (all.length < 2) return { ok: false, message: "This file has no donors in it: we need a heading row and at least one donor." };
  const { columns, unknown, twice } = mapContactHeadings(all[0]);
  if (twice.length) {
    return { ok: false, message: `Two columns mean the same thing (${twice.map((t) => t.map((n) => `"${n}"`).join(" and ")).join("; ")}), so we can't tell which one to use. Keep one of them and check the file again.` };
  }
  if (columns.first_name === undefined && columns.last_name === undefined && columns.organisation_name === undefined) {
    return { ok: false, message: "We couldn't find a First name, Surname or Organisation column. Use the headings in our template (download it above)." };
  }
  if (all.length - 1 > MAX_IMPORT_ROWS) return { ok: false, message: `This file has ${all.length - 1} rows. Import at most ${MAX_IMPORT_ROWS} at a time: split it into smaller files.` };

  const existing = opts.existingEmails ?? new Set<string>();
  const emailLine = new Map<string, number>();
  const rows: ContactRow[] = all.slice(1).map((cells, i) => {
    const line = i + 2;
    const fields: ContactFields = {};
    for (const [f, col] of Object.entries(columns) as [ContactField, number][]) fields[f] = cells[col] ?? "";
    // More filled cells than headings: something unquoted split a cell in two, so every value after it sits
    // under the wrong heading. Refused rather than imported shifted.
    if (cells.slice(all[0].length).some((c) => c.trim())) {
      return { line, check: { ok: false, errors: { first_name: "This row has more values than there are headings, so its details are in the wrong columns. Put any value with a comma in it in quotes" } } };
    }
    let check = checkContact(fields);
    if (check.ok && check.contact.email) {
      const email = check.contact.email;
      const earlier = emailLine.get(email);
      if (earlier) check = { ok: false, errors: { email: `Same email as row ${earlier}. Keep one of them` } };
      else if (existing.has(email)) check = { ok: false, errors: { email: `${email} is already on your list from an earlier import` } };
      else emailLine.set(email, line);
    }
    return { line, check };
  });
  const good = rows.filter((r) => r.check.ok).length;
  const tagNames: string[] = [];
  for (const r of rows) if (r.check.ok) for (const t of r.check.contact.tags) if (!tagNames.some((n) => n.toLowerCase() === t.toLowerCase())) tagNames.push(t);
  const headings = all[0].map((h) => h.trim().toLowerCase());
  return { ok: true, rows, unknownColumns: unknown, good, bad: rows.length - good, looksLikeGifts: headings.some((h) => GIFT_HEADINGS.includes(h)), tagNames };
}

/** Problems per row, in plain words, for the preview. */
export function rowProblems(rows: ContactRow[]): { line: number; messages: string[] }[] {
  return rows.flatMap((r) => (r.check.ok ? [] : [{ line: r.line, messages: Object.values(r.check.errors).filter((m): m is string => Boolean(m)) }]));
}
