/**
 * The charity checks each s18A receipt before the yearly run (CRM build plan step 1, Yossi 2.3, 09/11/2026).
 * Pure: no database, no clock. The server side is review-store.ts.
 *
 * Each planned certificate (one per donor record, s18A identity, charity and tax year: see plan.ts) is
 * "to check" until the charity approves it, declines it, or corrects the donor's name and address and so
 * approves it ("edited"). Only approved and edited ones are issued, and only after Givezy signs off the run.
 * Amounts, dates and the list of gifts are never decided here: they come only from recorded donations.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { cleanDedicationName } from "@/lib/donations/dedication";
import { formatRand } from "@/lib/money";
import { taxYearName } from "@/lib/dates";
import { buttonHtml, cardHtml, emailLayout, escHtml, paragraphHtml } from "@/lib/email/html";
import type { PlannedReceipt } from "./plan";

export type Decision = "approved" | "edited" | "declined";
export type CertificateStatus = "to_check" | Decision;

/** A decision as stored (receipt_plan_decisions). */
export type StoredDecision = {
  id: string;
  charityId: string;
  taxYear: number;
  donorId: string;
  donorIdentity: string;
  decision: Decision;
  certificateFingerprint: string;
  decidedAt: string;
  declineEmailedAt?: string | null;
};

/** A planned certificate with where the charity's check of it stands. */
export type DecidedReceipt = PlannedReceipt & {
  /** An opaque key for links and forms: never the donor record id or the identity fingerprint. */
  key: string;
  status: CertificateStatus;
  /** When the decision that counts was made (null while to check). Part of the run's fingerprint. */
  decidedAt: string | null;
  /** Approved before, but its gifts or total changed since: it needs checking again. */
  changedSince: boolean;
  decision: StoredDecision | null;
};

/** The words shown for each status, the same everywhere. */
export const STATUS_WORDS: Record<CertificateStatus, string> = {
  to_check: "To check",
  approved: "Approved",
  edited: "Edited and approved",
  declined: "Declined",
};

/** One certificate's place in the plan: the same key as one receipt. */
const groupOf = (x: { charityId: string; donorId: string; donorIdentity: string }) => `${x.charityId}|${x.donorId}|${x.donorIdentity}`;

/**
 * The key a charity's page uses for one certificate. A hash, so the s18A identity fingerprint (made from an ID
 * or tax number) never reaches the browser; the server finds the certificate again by working the plan out.
 */
export function certificateKey(charityId: string, taxYear: number, donorId: string, donorIdentity: string): string {
  return createHash("sha256").update(`certificate|${charityId}|${taxYear}|${donorId}|${donorIdentity}`).digest("hex").slice(0, 32);
}

/** What the charity looked at: the certificate's gifts and total. Any refund or late gift changes it. */
export function certificateFingerprint(r: Pick<PlannedReceipt, "donorId" | "donorIdentity" | "donationIds" | "totalCents">): string {
  return createHash("sha256").update(`${r.donorId}|${r.donorIdentity}|${[...r.donationIds].sort().join(",")}|${r.totalCents}`).digest("hex");
}

/**
 * Where each planned certificate stands. A decline holds whatever changes (only the charity reopens it). An
 * approval or an edit counts only for the certificate the charity saw: changed since, it is to check again.
 */
export function applyDecisions(receipts: PlannedReceipt[], decisions: StoredDecision[]): DecidedReceipt[] {
  const byGroup = new Map(decisions.map((d) => [`${groupOf(d)}|${d.taxYear}`, d]));
  return receipts.map((r) => {
    const d = byGroup.get(`${groupOf(r)}|${r.taxYear}`) ?? null;
    const key = certificateKey(r.charityId, r.taxYear, r.donorId, r.donorIdentity);
    if (!d) return { ...r, key, status: "to_check", decidedAt: null, changedSince: false, decision: null };
    if (d.decision === "declined") return { ...r, key, status: "declined", decidedAt: d.decidedAt, changedSince: false, decision: d };
    if (d.certificateFingerprint !== certificateFingerprint(r)) return { ...r, key, status: "to_check", decidedAt: null, changedSince: true, decision: d };
    return { ...r, key, status: d.decision, decidedAt: d.decidedAt, changedSince: false, decision: d };
  });
}

/** Issued with the run: approved or edited, never declined or still to check. */
export const willIssue = (r: Pick<DecidedReceipt, "status">) => r.status === "approved" || r.status === "edited";

/** How many certificates are at each status. */
export function countStatuses(list: Pick<DecidedReceipt, "status">[]): Record<CertificateStatus, number> {
  const out: Record<CertificateStatus, number> = { to_check: 0, approved: 0, edited: 0, declined: 0 };
  for (const r of list) out[r.status] += 1;
  return out;
}

// --- Correcting the donor's details --------------------------------------------------------------------------

/** The only columns a charity may correct: the name and street address SARS needs on the receipt. */
export const NAME_FIELDS = ["first_name", "last_name", "organisation_name"] as const;
export const ADDRESS_FIELDS = ["address_line1", "address_line2", "suburb", "city", "postal_code"] as const;
export type EditableField = (typeof NAME_FIELDS)[number] | (typeof ADDRESS_FIELDS)[number];
export type EditableDetails = Record<EditableField, string | null>;

const line = (max: number, what: string) =>
  z.string().max(max, `Please keep ${what} to ${max} characters or fewer`).optional().transform((v) => (v === undefined ? "" : cleanDedicationName(v)));

const editSchema = z.object({
  first_name: line(80, "the first name"),
  last_name: line(80, "the surname"),
  organisation_name: line(200, "the name"),
  address_line1: line(200, "the street address"),
  address_line2: line(200, "this line"),
  suburb: line(80, "the suburb"),
  city: line(80, "the city or town"),
  postal_code: z.string().max(10, "Postal codes are 4 digits").optional().transform((v) => (v ?? "").replace(/\s/g, "")),
});

export type EditCheck = { ok: true; values: EditableDetails } | { ok: false; fieldErrors: Record<string, string> };

/**
 * The charity's correction, checked. A person needs a first name and surname; a company or trust its name.
 * The receipt needs a street address, city and 4-digit postal code (as at checkout). Whatever else the form
 * sends (an ID number, an amount) is ignored: only these columns are ever written.
 */
export function checkCertificateEdit(input: Record<string, string | undefined>, donorType: "individual" | "company" | "trust"): EditCheck {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { ok: false, fieldErrors };
  }
  const v = parsed.data;
  const e: Record<string, string> = {};
  if (donorType === "individual") {
    if (!v.first_name) e.first_name = "Enter the donor's first name";
    if (!v.last_name) e.last_name = "Enter the donor's surname";
  } else if (!v.organisation_name) e.organisation_name = "Enter the registered name";
  if (!v.address_line1) e.address_line1 = "Enter the street address. SARS needs it on the receipt";
  if (!v.city) e.city = "Enter the city or town";
  if (!v.postal_code) e.postal_code = "Enter the postal code";
  else if (!/^\d{4}$/.test(v.postal_code)) e.postal_code = "Postal codes are 4 digits";
  if (Object.keys(e).length) return { ok: false, fieldErrors: e };
  const person = donorType === "individual";
  const nul = (s: string) => s || null;
  return {
    ok: true,
    values: {
      first_name: person ? nul(v.first_name) : null,
      last_name: person ? nul(v.last_name) : null,
      organisation_name: person ? null : nul(v.organisation_name),
      address_line1: nul(v.address_line1),
      address_line2: nul(v.address_line2),
      suburb: nul(v.suburb),
      city: nul(v.city),
      postal_code: nul(v.postal_code),
    },
  };
}

/** The columns to write for a person or an organisation (a person's correction never touches an organisation name). */
export function fieldsFor(donorType: "individual" | "company" | "trust"): EditableField[] {
  return [...(donorType === "individual" ? (["first_name", "last_name"] as const) : (["organisation_name"] as const)), ...ADDRESS_FIELDS];
}

/**
 * What a correction changes on each gift: the values before and after, only for the columns that differ.
 * Gifts already as corrected are left out. Used for the write, for Undo, and (as "name", "address") for the audit log.
 */
export function editRows(
  gifts: { donationId: string; current: Partial<Record<EditableField, string | null>> }[],
  values: EditableDetails,
  fields: EditableField[],
): { donationId: string; before: Partial<EditableDetails>; after: Partial<EditableDetails> }[] {
  const norm = (s: string | null | undefined) => (s ?? "").trim() || null;
  const out: { donationId: string; before: Partial<EditableDetails>; after: Partial<EditableDetails> }[] = [];
  for (const g of gifts) {
    const before: Partial<EditableDetails> = {};
    const after: Partial<EditableDetails> = {};
    for (const f of fields) {
      if (norm(g.current[f]) === norm(values[f])) continue;
      before[f] = g.current[f] ?? null;
      after[f] = values[f];
    }
    if (Object.keys(after).length) out.push({ donationId: g.donationId, before, after });
  }
  return out;
}

/** "name", "address" or both: what the audit log says changed (never the personal data itself). */
export function changedParts(rows: { after: Partial<EditableDetails> }[]): ("name" | "address")[] {
  const keys = new Set(rows.flatMap((r) => Object.keys(r.after)));
  const parts: ("name" | "address")[] = [];
  if (NAME_FIELDS.some((f) => keys.has(f))) parts.push("name");
  if (ADDRESS_FIELDS.some((f) => keys.has(f))) parts.push("address");
  return parts;
}

// --- The email to a donor whose certificate the charity declined ---------------------------------------------

/**
 * Plain words, no blame, no exclamation marks: the charity wants to talk to the donor before it issues their
 * s18A receipt, and here is how to reach it. Nothing about why (the charity says that itself).
 */
export function buildDeclineEmail(args: {
  donorName: string;
  donorType: "individual" | "company" | "trust";
  charityName: string;
  taxYear: number;
  totalCents: number;
  contactPhone: string;
  contactEmail: string;
  siteUrl: string;
  platformName: string;
}) {
  const greeting = args.donorType === "individual" ? args.donorName.split(" ")[0] || "there" : args.donorName || "there";
  const year = taxYearName(args.taxYear);
  const subject = `Please contact ${args.charityName} about your s18A receipt`;
  const account = `${args.siteUrl.replace(/\/$/, "")}/account`;
  const text = [
    `Dear ${greeting},`,
    "",
    `${args.charityName} has not issued your s18A receipt for the ${year} tax year yet. They would like to check something with you first.`,
    "",
    `Please contact them:`,
    `Phone: ${args.contactPhone}`,
    `Email: ${args.contactEmail}`,
    "",
    `Your donations to them in that tax year came to ${formatRand(args.totalCents)}. Nothing about your donations has changed.`,
    `Your s18A receipts are in your account: ${account}`,
    "",
    `${args.platformName}, on behalf of ${args.charityName}`,
  ].join("\n");
  const html = emailLayout({
    title: subject,
    siteUrl: args.siteUrl,
    bodyHtml: [
      paragraphHtml(`Dear ${escHtml(greeting)},`),
      paragraphHtml(`<strong>${escHtml(args.charityName)}</strong> has not issued your s18A receipt for the ${escHtml(year)} tax year yet. They would like to check something with you first.`),
      paragraphHtml("Please contact them:"),
      cardHtml([{ label: "Phone", value: args.contactPhone }, { label: "Email", value: args.contactEmail }]),
      paragraphHtml(`Your donations to them in that tax year came to ${escHtml(formatRand(args.totalCents))}. Nothing about your donations has changed.`),
      buttonHtml("See your s18A receipts", account),
      paragraphHtml(`${escHtml(args.platformName)}, on behalf of ${escHtml(args.charityName)}`, { muted: true }),
    ].join("\n"),
  });
  return { subject, text, html };
}
