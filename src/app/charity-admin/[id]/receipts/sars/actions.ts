"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { recordAction } from "@/lib/charity/charity-actions";
import { loadCharityForManager } from "@/lib/charity/queries";
import { isOwner } from "@/lib/charity/team";
import type { FormState } from "@/lib/form";
import { isLegalForm } from "@/lib/receipts/it3d";
import { ENTITY_TAX_REFERENCE_FIRST_DIGITS, isValidCompanyRegistration, normaliseCompanyRegistration, passesModulus10 } from "@/lib/sars-numbers";
import { createAdminClient } from "@/lib/supabase/admin";

const COLUMNS = ["tax_reference_number", "legal_form", "registration_number"] as const;

/**
 * The charity's own SARS details (03/11/2026): income tax reference number, legal form (SARS's Nature of Person)
 * and registration number. Only the owner saves them; the database lets only the server write them. Undo for 30
 * minutes, like every other saved detail.
 */
export async function saveSarsDetails(charityId: string, year: number, period: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  await loadCharityForManager(charityId);
  if (!(await isOwner(charityId))) return { ok: false, message: "Only your charity's owner can change its SARS details. Nothing was changed." };

  const tax = String(formData.get("tax_reference_number") ?? "").replace(/\s/g, "");
  const form = String(formData.get("legal_form") ?? "");
  const regTyped = String(formData.get("registration_number") ?? "").replace(/\s+/g, " ").trim();
  const e: Record<string, string> = {};
  if (tax && !/^\d{10}$/.test(tax)) e.tax_reference_number = "Income tax reference numbers are 10 digits";
  else if (tax && !ENTITY_TAX_REFERENCE_FIRST_DIGITS.includes(tax[0] as (typeof ENTITY_TAX_REFERENCE_FIRST_DIGITS)[number])) e.tax_reference_number = "SARS's numbers for organisations start with 0, 1, 2, 3, 7 or 9. Check the first digit";
  else if (tax && !passesModulus10(tax)) e.tax_reference_number = "That number doesn't pass SARS's check. Check the 10 digits";
  if (form && !isLegalForm(form)) e.legal_form = "Choose one of the options";
  let reg = regTyped;
  if (form === "OTHER_CO" && reg) {
    if (!isValidCompanyRegistration(reg, new Date())) e.registration_number = "Use the CIPC number as SARS writes it, for example 2015/123456/08";
    else reg = normaliseCompanyRegistration(reg);
  }
  if (form === "INTERVIVOS_TRUST" && reg.length > 15) e.registration_number = "SARS takes a trust number of up to 15 characters, for example IT1234/2015";
  if (reg.length > 30) e.registration_number = "Please keep it to 30 characters or fewer";
  if (/[|]/.test(reg)) e.registration_number = 'A registration number can\'t have a "|" in it';
  if (Object.keys(e).length) return { ok: false, message: "Please fix the highlighted fields. Nothing was saved.", fieldErrors: e };

  const db = createAdminClient();
  const after = { tax_reference_number: tax || null, legal_form: form || null, registration_number: reg || null };
  const { data: was, error: readError } = await db.from("charity_private").select([...COLUMNS, "sars_details_updated_at"].join(", ")).eq("charity_id", charityId).maybeSingle();
  if (readError || !was) return { ok: false, message: "That didn't save, so nothing was changed. Please try again." };
  // Undo puts the old timestamp back too. It is in `before` only: Undo's "changed since" check compares every key
  // of `after` with the database's own text form of a timestamp, which never equals the ISO string we wrote.
  const before = Object.fromEntries([...COLUMNS, "sars_details_updated_at"].map((c) => [c, (was as unknown as Record<string, unknown>)[c] ?? null]));
  const { error } = await db.from("charity_private").update({ ...after, sars_details_updated_at: new Date().toISOString() }).eq("charity_id", charityId);
  if (error) {
    console.error("[sars details]", error.message);
    return { ok: false, message: "That didn't save, so nothing was changed. Please try again." };
  }
  // Which fields changed, never the numbers.
  await logAudit({ actorUserId: viewer.userId, action: "charity.sars_details_saved", entityType: "charity", entityId: charityId, details: { changed: COLUMNS.filter((c) => before[c] !== after[c]) } });
  const done = await recordAction(charityId, viewer.userId, "sars_details_saved", {}, { type: "restore", table: "charity_private", before, after });
  revalidatePath(`/charity-admin/${charityId}/receipts/sars`);
  const q = new URLSearchParams({ year: String(Number(year) || ""), period: period === "first_half" ? "first_half" : "full_year", done });
  redirect(`/charity-admin/${charityId}/receipts/sars?${q}#sars-details`);
}
