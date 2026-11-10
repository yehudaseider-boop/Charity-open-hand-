/**
 * A charity's IT3(d) history (CRM build plan step 15, 10/11/2026). Pure: no database.
 *
 * Givezy can't submit to SARS, so the history holds what Givezy knows (each time the SARS data file or the
 * eFiling capture sheet was produced for download: who, when, the period, and the counts and total) and what
 * the charity tells us (the owner's own mark, "Uploaded to SARS on dd/mm/yyyy", with an optional short
 * reference). Givezy never checks the mark with SARS.
 *
 * Counts and a total only: never a donor's name, an ID, tax or registration number, the file, its name (it
 * carries the charity's tax reference number) or the Source Identifier.
 */
import { isoDateInJhb } from "@/lib/dates";
import { isValidSaIdNumber } from "@/lib/sa-id";
import { showDay, typedDay, TYPED_DAY_MESSAGE } from "@/lib/typed-date";
import { ERASED_LEFT_OUT, type It3dPeriod, type It3dResult } from "./it3d";

export type It3dHistoryKind = "file" | "sheet";

/** What is written for one download. Every column is listed here: nothing else from the result can ride along. */
export type It3dHistoryEntry = {
  charity_id: string;
  tax_year: number;
  period: It3dPeriod;
  kind: It3dHistoryKind;
  test_data: boolean;
  receipts: number;
  donors: number;
  donations: number;
  total_cents: number;
  receipts_left_out: number;
  created_by: string;
};

/** The row for one download, from the built result: its counts and total, field by field. */
export function it3dHistoryEntry(args: {
  charityId: string;
  userId: string;
  taxYear: number;
  period: It3dPeriod;
  kind: It3dHistoryKind;
  testData?: boolean;
  result: Pick<It3dResult, "totals" | "problems">;
}): It3dHistoryEntry {
  const { totals, problems } = args.result;
  return {
    charity_id: args.charityId,
    tax_year: args.taxYear,
    period: args.period,
    kind: args.kind,
    test_data: args.kind === "file" && Boolean(args.testData),
    receipts: totals.receipts,
    donors: totals.donors,
    donations: totals.donations,
    total_cents: totals.totalCents,
    // One note per receipt left out because its donor was erased before the SARS details were kept.
    receipts_left_out: problems.filter((p) => p.message === ERASED_LEFT_OUT).length,
    created_by: args.userId,
  };
}

/** The longest reference the owner can keep with their mark. */
export const MAX_UPLOAD_REFERENCE = 40;

export type UploadMark = { ok: true; uploadedOn: string; reference: string | null } | { ok: false; fieldErrors: Record<string, string> };

/**
 * Check the owner's "Uploaded to SARS on" mark. The date is a real day, not before the day the file was produced
 * and not in the future (Johannesburg days). The reference is one short line of plain text, and never an ID number.
 */
export function checkUploadMark(input: { uploadedOn: unknown; reference: unknown; producedAt: string; now?: Date }): UploadMark {
  const e: Record<string, string> = {};
  const typed = String(input.uploadedOn ?? "").trim();
  const day = typedDay(typed);
  const produced = isoDateInJhb(new Date(input.producedAt));
  if (!typed) e.uploaded_on = "Enter the date you uploaded it, as dd/mm/yyyy";
  else if (!day) e.uploaded_on = TYPED_DAY_MESSAGE;
  else if (day > isoDateInJhb(input.now ?? new Date())) e.uploaded_on = "That date is in the future. Enter the day you uploaded it";
  else if (day < produced) e.uploaded_on = `This was downloaded on ${showDay(produced)}, so it can't have been uploaded before then`;

  const reference = String(input.reference ?? "").replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
  if ([...reference].length > MAX_UPLOAD_REFERENCE) e.upload_reference = `Please keep the reference to ${MAX_UPLOAD_REFERENCE} characters or fewer`;
  else if ((reference.replace(/[\s-]/g, "").match(/\d{13}/g) ?? []).some(isValidSaIdNumber)) {
    e.upload_reference = "That looks like an ID number. Use your eFiling reference only, never a donor's details";
  }
  if (Object.keys(e).length || !day) return { ok: false, fieldErrors: e };
  return { ok: true, uploadedOn: day, reference: reference || null };
}

export const HISTORY_KIND_LABELS: Record<It3dHistoryKind, string> = { file: "SARS data file", sheet: "eFiling capture sheet" };
