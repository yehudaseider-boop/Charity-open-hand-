"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAction } from "@/lib/charity/charity-actions";
import { logAudit } from "@/lib/audit";
import { legalConfig } from "@/config/legal";
import { requireViewer } from "@/lib/auth";
import { applicationChecklist, isComplete } from "@/lib/charity/checklist";
import { applicationReceivedEmail, contactChangedEmail, newApplicationEmail, notifyCharity } from "@/lib/charity/emails";
import { loadCharityForManager } from "@/lib/charity/queries";
import {
  addressSchema,
  bankSchema,
  contactSchema,
  DOCUMENT_MIME,
  documentTypes,
  MAX_UPLOAD_BYTES,
  normalisePhone,
  organisationSchema,
  type DocumentType,
} from "@/lib/charity/validation";
import { encrypt, last4 } from "@/lib/crypto";
import { isoDateInJhb } from "@/lib/dates";
import { formToObject, zodErrors, type FormState } from "@/lib/form";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRealDocument } from "@/lib/charity/file-check";
import { createClient } from "@/lib/supabase/server";

/** The values of these columns as they are now, for "Undo". */
function pick(row: unknown, cols: string[]): Record<string, unknown> {
  return Object.fromEntries(cols.map((c) => [c, (row as Record<string, unknown> | null)?.[c] ?? null]));
}

const back = (charityId: string, step: string, done: string) => `/charity-admin/${charityId}/application?step=${step}&done=${done}`;

/** Turn a database refusal (from our guard triggers) into a readable message. */
function refusal(error: { message: string } | null, rows: unknown[] | null): FormState | null {
  if (error) return { ok: false, message: error.message };
  if (!rows || rows.length === 0) return { ok: false, message: "You can't edit this charity." };
  return null;
}

function editable(status: string) {
  return status === "draft" || status === "rejected";
}

async function loadEditable(charityId: string) {
  const data = await loadCharityForManager(charityId);
  if (!editable(data.charity.status)) {
    return { data, locked: { ok: false, message: "This application has been submitted and is locked." } as FormState };
  }
  return { data, locked: null };
}

export async function saveOrganisation(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const { data: loaded, locked } = await loadEditable(charityId);
  if (locked) return locked;
  const parsed = organisationSchema.safeParse(formToObject(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const after = {
    name_en: v.name_en,
    legal_name_en: v.legal_name_en,
    npo_number: v.npo_number ?? null,
    pbo_number: v.pbo_number ?? null,
    s18a_reference: v.s18a_reference ?? null,
  };
  const before = pick(loaded.charity, Object.keys(after));
  const { data, error } = await supabase.from("charities").update(after).eq("id", charityId).select("id");
  const fail = refusal(error, data);
  if (fail) return fail;
  const done = await recordAction(charityId, viewer.userId, "organisation_saved", {}, { type: "restore", table: "charities", before, after });
  revalidatePath(`/charity-admin/${charityId}/application`);
  redirect(back(charityId, "organisation", done));
}

export async function saveAddress(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const { data: loaded, locked } = await loadEditable(charityId);
  if (locked) return locked;
  const parsed = addressSchema.safeParse(formToObject(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const after = {
    address_line1: v.address_line1,
    address_line2: v.address_line2 ?? null,
    suburb: v.suburb ?? null,
    city: v.city,
    postal_code: v.postal_code,
  };
  const before = pick(loaded.charity, Object.keys(after));
  const { data, error } = await supabase.from("charities").update(after).eq("id", charityId).select("id");
  const fail = refusal(error, data);
  if (fail) return fail;
  const done = await recordAction(charityId, viewer.userId, "address_saved", {}, { type: "restore", table: "charities", before, after });
  revalidatePath(`/charity-admin/${charityId}/application`);
  redirect(back(charityId, "address", done));
}

export async function saveContact(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const { charity, priv: before } = await loadCharityForManager(charityId);
  const raw = formToObject(formData);
  raw.contact_phone = normalisePhone(raw.contact_phone);
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) return zodErrors(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const after = { contact_name: v.contact_name, contact_email: v.contact_email, contact_phone: v.contact_phone ?? null };
  const contactBefore = pick(before, Object.keys(after));
  const { data, error } = await supabase.from("charity_private").update(after).eq("charity_id", charityId).select("charity_id");
  const fail = refusal(error, data);
  if (fail) return fail;
  // Our emails about bank changes and approval go to this address: tell the old one when it moves.
  const oldEmail = before?.contact_email ?? null;
  if (oldEmail && oldEmail.toLowerCase() !== v.contact_email.toLowerCase()) {
    await logAudit({ actorUserId: viewer.userId, action: "charity.contact_email_changed", entityType: "charity", entityId: charityId });
    await notifyCharity(contactChangedEmail(oldEmail, charity.name_en, v.contact_email));
  }
  const done = await recordAction(charityId, viewer.userId, "contact_saved", { email: v.contact_email }, { type: "restore", table: "charity_private", before: contactBefore, after });
  revalidatePath(`/charity-admin/${charityId}/application`);
  redirect(back(charityId, "contact", done));
}

export async function saveBank(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const { locked } = await loadEditable(charityId);
  if (locked) return locked;
  const parsed = bankSchema.safeParse(formToObject(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const after = {
    bank_name: v.bank_name,
    bank_account_holder: v.bank_account_holder,
    bank_account_number_encrypted: encrypt(v.bank_account_number),
    bank_account_last4: last4(v.bank_account_number),
    bank_branch_code: v.bank_branch_code,
  };
  // The details as they were (the account number stays encrypted), for "Undo". Never sent to the browser.
  const { data: was, error: readError } = await createAdminClient().from("charity_private").select(Object.keys(after).join(", ")).eq("charity_id", charityId).maybeSingle();
  if (readError) return { ok: false, message: "That didn't save. Please try again." };
  const { data, error } = await supabase
    .from("charity_private")
    .update({ ...after, bank_verified_at: null })
    .eq("charity_id", charityId)
    .select("charity_id");
  const fail = refusal(error, data);
  if (fail) return fail;
  await logAudit({
    actorUserId: viewer.userId,
    action: "charity.bank_details_saved",
    entityType: "charity",
    entityId: charityId,
    details: { bank_name: v.bank_name, last4: last4(v.bank_account_number) },
  });
  // Taking it back puts the previous details back; they are checked again before going live either way.
  const done = await recordAction(charityId, viewer.userId, "bank_saved", { last4: last4(v.bank_account_number) }, {
    type: "restore", table: "charity_private", before: pick(was, Object.keys(after)), after,
  });
  revalidatePath(`/charity-admin/${charityId}/application`);
  redirect(back(charityId, "bank", done));
}

export async function uploadDocument(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const { locked } = await loadEditable(charityId);
  if (locked) return locked;

  const type = String(formData.get("document_type") ?? "") as DocumentType;
  const file = formData.get("file");
  const signedOn = String(formData.get("signed_on") ?? "").trim() || null;

  if (!(type in documentTypes)) return { ok: false, fieldErrors: { document_type: "Choose a document type" } };
  if (!(file instanceof File) || file.size === 0) return { ok: false, fieldErrors: { file: "Choose a file" } };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, fieldErrors: { file: "Files must be 5 MB or smaller" } };
  if (!(DOCUMENT_MIME as readonly string[]).includes(file.type)) {
    return { ok: false, fieldErrors: { file: "Upload a PDF, JPG or PNG" } };
  }
  if (!(await isRealDocument(file))) return { ok: false, fieldErrors: { file: "That file isn't a PDF, JPG or PNG" } };
  if (type === "receipting_mandate") {
    if (!signedOn || !/^\d{4}-\d{2}-\d{2}$/.test(signedOn)) {
      return { ok: false, fieldErrors: { signed_on: "Enter the date the mandate was signed" } };
    }
    if (signedOn > isoDateInJhb()) {
      return { ok: false, fieldErrors: { signed_on: "The signing date can't be in the future" } };
    }
  }

  const ext = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" }[file.type];
  const path = `${charityId}/${type}-${crypto.randomUUID()}.${ext}`;
  const supabase = await createClient();
  const upload = await supabase.storage
    .from("charity-documents")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upload.error) {
    console.error(upload.error);
    return { ok: false, message: "The upload didn't work. Please try again." };
  }

  const { data: made, error } = await supabase.from("charity_documents").insert({
    charity_id: charityId,
    document_type: type,
    storage_path: path,
    file_name: file.name.slice(0, 200),
    signed_on: type === "receipting_mandate" ? signedOn : null,
    uploaded_by: viewer.userId,
  }).select("id").single();
  if (error) {
    await createAdminClient().storage.from("charity-documents").remove([path]);
    console.error(error);
    return { ok: false, message: /submitted/.test(error.message) ? "Documents can't be added once the application is submitted." : "That didn't save. Please try again." };
  }
  const done = await recordAction(charityId, viewer.userId, "document_uploaded", { fileName: file.name.slice(0, 200), label: documentTypes[type] }, {
    type: "delete", table: "charity_documents", id: made.id as string, file: { bucket: "charity-documents", path },
  });
  revalidatePath(`/charity-admin/${charityId}/application`);
  redirect(back(charityId, "documents", done));
}

export async function removeDocument(charityId: string, documentId: string): Promise<void> {
  const viewer = await requireViewer();
  const { data, locked } = await loadEditable(charityId);
  if (locked) return;
  const doc = data.documents.find((d) => d.id === documentId);
  if (!doc) return;
  // The whole row, so "Undo" can put it back exactly; the file is kept for the same reason.
  const { data: row, error: readError } = await createAdminClient().from("charity_documents").select("*").eq("id", documentId).eq("charity_id", charityId).maybeSingle();
  if (readError) throw readError;
  if (!row) return;
  const supabase = await createClient();
  const { error } = await supabase.from("charity_documents").delete().eq("id", documentId);
  if (error) throw error;
  const done = await recordAction(charityId, viewer.userId, "document_removed", { fileName: doc.file_name }, { type: "reinsert", table: "charity_documents", row });
  revalidatePath(`/charity-admin/${charityId}/application`);
  redirect(back(charityId, "documents", done));
}

export async function submitApplication(charityId: string, _prev: FormState, formData?: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const declarationNames = ["declare_authority", "declare_true", "declare_terms", "declare_donor_data"];
  if (!formData || declarationNames.some((n) => formData.get(n) !== "on")) {
    return { ok: false, message: "Please tick all four declarations to submit." };
  }
  const { data, locked } = await loadEditable(charityId);
  if (locked) return locked;
  const checklist = applicationChecklist({
    charity: data.charity,
    priv: data.priv,
    documentTypes: data.documents.map((d) => d.document_type),
  });
  if (!isComplete(checklist)) {
    return { ok: false, message: "Some sections are still incomplete. See the checklist." };
  }
  // Only this server action can submit (the database no longer lets a browser change a charity's status),
  // so the four declarations and the consent record below always come with a submission.
  const { data: rows, error } = await createAdminClient()
    .from("charities")
    .update({ status: "pending_review" })
    .eq("id", charityId)
    .in("status", ["draft", "rejected"])
    .select("id");
  const fail = refusal(error, rows);
  if (fail) return fail;
  const consent = await createAdminClient()
    .from("consents")
    .insert({ kind: "charity_declarations", policy_version: legalConfig.policyVersion, user_id: viewer.userId, charity_id: charityId });
  if (consent.error) throw consent.error;
  await logAudit({
    actorUserId: viewer.userId,
    action: "charity.application_submitted",
    entityType: "charity",
    entityId: charityId,
  });
  // Tell the charity we have it, and tell us there is one to review.
  await notifyCharity(applicationReceivedEmail(data.priv?.contact_email ?? viewer.email ?? "", data.charity.name_en));
  if (process.env.ADMIN_NOTIFY_EMAIL) await notifyCharity(newApplicationEmail(process.env.ADMIN_NOTIFY_EMAIL, data.charity.name_en, charityId));
  // A submission can't be taken back (we've been told and are reviewing): the page asked first.
  const done = await recordAction(charityId, viewer.userId, "application_submitted", {}, null);
  revalidatePath(`/charity-admin/${charityId}/application`);
  redirect(`/charity-admin/${charityId}/application?done=${done}`);
}
