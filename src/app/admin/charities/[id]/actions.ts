"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth";
import { applicationChecklist, isComplete } from "@/lib/charity/checklist";
import { adminRemovedEmail, approvedEmail, connectedEmail, notifyCharity, receiptsReadyEmail, reinstatedEmail, secondStepResetEmail, sentBackEmail, suspendedEmail } from "@/lib/charity/emails";
import { loadCharityForManager } from "@/lib/charity/queries";
import { decrypt, encrypt, last4 } from "@/lib/crypto";
import { bankSchema, DOCUMENT_MIME, documentTypes, MAX_UPLOAD_BYTES, type DocumentType } from "@/lib/charity/validation";
import { isRealDocument } from "@/lib/charity/file-check";
import { formatDate, isoDateInJhb } from "@/lib/dates";
import { getEmailTransport } from "@/lib/email";
import { formToObject, zodErrors } from "@/lib/form";
import { getGateway, GatewayError } from "@/lib/gateway";
import type { FormState } from "@/lib/form";
import { isUuid } from "@/lib/ids";
import { createAdminClient } from "@/lib/supabase/admin";

function refresh(id: string, slug?: string) {
  revalidatePath(`/admin/charities/${id}`);
  revalidatePath("/admin/charities");
  revalidatePath("/charities");
  if (slug) revalidatePath(`/c/${slug}`);
}

/** A date the charity typed (yyyy-mm-dd), as midnight in Johannesburg. */
function saMidnight(date: string) {
  return `${date}T00:00:00+02:00`;
}


/** Log the real error for us; show the admin a plain message. */
function failed(error: unknown): FormState {
  console.error(error);
  return { ok: false, message: "That didn't save. Please try again." };
}

export async function approveCharity(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  const { charity, priv, documents } = await loadCharityForManager(id);
  if (charity.status !== "pending_review") return { ok: false, message: "Only applications waiting for review can be approved." };
  const contactEmail = priv?.contact_email ?? null;

  const checklist = applicationChecklist({ charity, priv, documentTypes: documents.map((d) => d.document_type) });
  if (!isComplete(checklist)) return { ok: false, message: "The application is incomplete." };
  if (formData.get("confirm_verified") !== "on") {
    return { ok: false, message: "Tick the box confirming you have vetted the organisation and its documents." };
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    status: "approved",
    approved_at: now,
    is_verified: true,
    verified_at: now,
    rejection_reason: null,
  };

  const confirmS18a = formData.get("confirm_s18a") === "on";
  const confirmMandate = formData.get("confirm_mandate") === "on";
  if (confirmS18a || confirmMandate) {
    if (!charity.s18a_reference) return { ok: false, message: "This charity has no s18A reference number." };
  }
  if (confirmS18a) {
    update.is_s18a = true;
    update.s18a_confirmed_at = now;
  }
  if (confirmMandate) {
    const mandate = documents.filter((d) => d.document_type === "receipting_mandate").at(-1);
    if (!mandate?.signed_on) return { ok: false, message: "No signed mandate with a signing date has been uploaded." };
    update.mandate_signed_at = saMidnight(mandate.signed_on);
    update.mandate_document_path = mandate.storage_path;
  }

  // Only if nobody else decided in the meantime.
  const { data, error } = await createAdminClient().from("charities").update(update).eq("id", id).eq("status", "pending_review").select("id");
  if (error) return failed(error);
  if (!data?.length) return { ok: false, message: "Someone else changed this charity just now. Reload the page to see where it stands." };
  // The vetting tick covers the bank confirmation letter too: record it, so the charity can be connected.
  const { error: bankError } = await createAdminClient().from("charity_private").update({ bank_verified_at: now }).eq("charity_id", id).is("bank_verified_at", null);
  if (bankError) return failed(bankError);
  await logAudit({
    actorUserId: admin.userId,
    action: "charity.approved",
    entityType: "charity",
    entityId: id,
    details: { s18a_confirmed: confirmS18a, mandate_confirmed: confirmMandate },
  });
  if (contactEmail) await notifyCharity(approvedEmail(contactEmail, charity.name_en, id, confirmS18a && confirmMandate));
  refresh(id, charity.slug);
  return { ok: true, message: contactEmail ? "Approved. The charity has been emailed." : "Approved. (No contact email on file, so nobody was emailed.)" };
}

function reasonFrom(formData: FormData) {
  const reason = String(formData.get("reason") ?? "").trim();
  return reason.length >= 5 ? reason.slice(0, 2000) : null;
}

export async function rejectCharity(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  const { charity, priv } = await loadCharityForManager(id);
  if (charity.status !== "pending_review") return { ok: false, message: "Only applications waiting for review can be sent back." };
  const reason = reasonFrom(formData);
  if (!reason) return { ok: false, fieldErrors: { reason: "Explain what the charity needs to fix" } };

  const { data, error } = await createAdminClient()
    .from("charities")
    .update({ status: "rejected", rejection_reason: reason })
    .eq("id", id)
    .eq("status", "pending_review")
    .select("id");
  if (error) return failed(error);
  if (!data?.length) return { ok: false, message: "Someone else changed this charity just now. Reload the page to see where it stands." };
  await logAudit({ actorUserId: admin.userId, action: "charity.rejected", entityType: "charity", entityId: id, details: { reason } });
  if (priv?.contact_email) await notifyCharity(sentBackEmail(priv.contact_email, charity.name_en, id, reason));
  refresh(id);
  return { ok: true, message: priv?.contact_email ? "Sent back to the charity, and they've been emailed what to fix." : "Sent back to the charity. (No contact email on file, so nobody was emailed.)" };
}

export async function suspendCharity(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  const { charity, priv } = await loadCharityForManager(id);
  if (charity.status !== "approved") return { ok: false, message: "Only approved charities can be suspended." };
  const reason = reasonFrom(formData);
  if (!reason) return { ok: false, fieldErrors: { reason: "Give a reason for the record" } };

  const { data, error } = await createAdminClient()
    .from("charities")
    .update({ status: "suspended", rejection_reason: reason })
    .eq("id", id)
    .eq("status", "approved")
    .select("id");
  if (error) return failed(error);
  if (!data?.length) return { ok: false, message: "Someone else changed this charity just now. Reload the page to see where it stands." };
  await logAudit({ actorUserId: admin.userId, action: "charity.suspended", entityType: "charity", entityId: id, details: { reason } });
  if (priv?.contact_email) await notifyCharity(suspendedEmail(priv.contact_email, charity.name_en, id, reason));
  refresh(id, charity.slug);
  return { ok: true, message: `Suspended. The charity is hidden and can't receive donations.${priv?.contact_email ? " Its contact has been emailed the reason." : ""}` };
}

export async function reinstateCharity(id: string, _prev: FormState): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  const { charity, priv } = await loadCharityForManager(id);
  if (charity.status !== "suspended") return { ok: false, message: "Only suspended charities can be reinstated." };
  const { data, error } = await createAdminClient()
    .from("charities")
    .update({ status: "approved", rejection_reason: null })
    .eq("id", id)
    .eq("status", "suspended")
    .select("id");
  if (error) return failed(error);
  if (!data?.length) return { ok: false, message: "Someone else changed this charity just now. Reload the page to see where it stands." };
  await logAudit({ actorUserId: admin.userId, action: "charity.reinstated", entityType: "charity", entityId: id });
  if (priv?.contact_email) await notifyCharity(reinstatedEmail(priv.contact_email, charity.name_en, id));
  refresh(id, charity.slug);
  return { ok: true, message: "Reinstated." };
}

export async function revokeS18a(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  const { charity } = await loadCharityForManager(id);
  if (!charity.is_s18a) return { ok: false, message: "This charity is not marked s18A." };
  const reason = reasonFrom(formData);
  if (!reason) return { ok: false, fieldErrors: { reason: "Give a reason for the record" } };
  const { error } = await createAdminClient()
    .from("charities")
    .update({ is_s18a: false, s18a_confirmed_at: null })
    .eq("id", id);
  if (error) return failed(error);
  await logAudit({ actorUserId: admin.userId, action: "charity.s18a_revoked", entityType: "charity", entityId: id, details: { reason } });
  refresh(id, charity.slug);
  return { ok: true, message: "s18A status removed. No new receipts will be issued." };
}

export async function revealBankAccount(id: string, _prev: FormState): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  if (!isUuid(id)) return { ok: false, message: "Unknown charity." };
  const { data, error } = await createAdminClient()
    .from("charity_private")
    .select("bank_account_number_encrypted")
    .eq("charity_id", id)
    .single();
  if (error || !data?.bank_account_number_encrypted) return { ok: false, message: "No bank account saved." };
  await logAudit({ actorUserId: admin.userId, action: "charity.bank_account_revealed", entityType: "charity", entityId: id });
  return { ok: true, message: `Account number: ${decrypt(data.bank_account_number_encrypted)}` };
}

export async function addCharityAdmin(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  if (!isUuid(id)) return { ok: false, message: "Unknown charity." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, fieldErrors: { email: "Enter a valid email" } };

  const db = createAdminClient();
  let { data: profile } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
  if (profile) {
    // An account someone registered but never confirmed could belong to anyone who typed this email:
    // never give it a charity's access.
    const existing = await db.auth.admin.getUserById(profile.id);
    if (existing.error || !existing.data.user?.email_confirmed_at) {
      return { ok: false, message: "That email has an unconfirmed account. Ask them to sign in once with the emailed code first, then add them again." };
    }
  } else {
    const created = await db.auth.admin.createUser({ email, email_confirm: true });
    if (created.error) return { ok: false, message: created.error.message };
    profile = { id: created.data.user.id };
  }
  const { error } = await db
    .from("charity_admins")
    .upsert({ charity_id: id, user_id: profile.id, role: "admin" }, { onConflict: "charity_id,user_id", ignoreDuplicates: true });
  if (error) return failed(error);
  // The person's id, not their address: the audit log is append-only and outlives an erasure.
  await logAudit({ actorUserId: admin.userId, action: "charity.admin_added", entityType: "charity", entityId: id, details: { user_id: profile.id } });
  refresh(id);
  return { ok: true, message: `${email} can now sign in and manage this charity.` };
}

export async function connectToGateway(id: string, _prev: FormState): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  const { charity, priv: contact } = await loadCharityForManager(id);
  if (charity.status !== "approved") return { ok: false, message: "Approve the charity first." };

  const db = createAdminClient();
  const { data: priv } = await db
    .from("charity_private")
    .select("bank_name, bank_account_holder, bank_account_number_encrypted, bank_branch_code, bank_verified_at")
    .eq("charity_id", id)
    .single();
  if (!priv?.bank_account_number_encrypted || !priv.bank_name || !priv.bank_branch_code) {
    return { ok: false, message: "Bank details are incomplete." };
  }
  // Donations settle straight into this account, so it is never registered unchecked.
  if (!priv.bank_verified_at) return { ok: false, message: "Check the bank details first: approve the charity, or change the bank details with its confirmation letter." };

  const gateway = getGateway();
  try {
    const { accountRef } = await gateway.createCharityAccount({
      charityId: id,
      businessName: charity.legal_name_en,
      bankName: priv.bank_name,
      accountNumber: decrypt(priv.bank_account_number_encrypted),
      branchCode: priv.bank_branch_code,
      accountHolder: priv.bank_account_holder ?? charity.legal_name_en,
    });
    const { error } = await db
      .from("charities")
      .update({ gateway: gateway.name, gateway_subaccount_ref: accountRef })
      .eq("id", id);
    if (error) return failed(error);
    await logAudit({
      actorUserId: admin.userId,
      action: "charity.gateway_connected",
      entityType: "charity",
      entityId: id,
      details: { gateway: gateway.name, account_ref: accountRef },
    });
  } catch (e) {
    if (e instanceof GatewayError) return { ok: false, message: e.message };
    throw e;
  }
  if (contact?.contact_email) await notifyCharity(connectedEmail(contact.contact_email, charity.name_en, id));
  refresh(id, charity.slug);
  return { ok: true, message: "Connected. The charity can now take donations, and its contact has been emailed." };
}

/**
 * Change a charity's bank details after its application was submitted. Only a platform admin can
 * (the charity cannot, by design). The charity is taken off the payment gateway until it is
 * connected again with the new account, and its contact is emailed, because changed bank
 * details are how payments get diverted.
 */
export async function changeBankDetails(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  if (!isUuid(id)) return { ok: false, message: "Unknown charity." };
  const parsed = bankSchema.safeParse(formToObject(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  if (formData.get("checked_letter") !== "on") {
    return { ok: false, fieldErrors: { checked_letter: "Tick to confirm you have checked the bank confirmation letter" } };
  }
  const v = parsed.data;

  const db = createAdminClient();
  const { data: charity, error: charityError } = await db.from("charities").select("id, slug, name_en, gateway, gateway_subaccount_ref").eq("id", id).maybeSingle();
  if (charityError || !charity) return { ok: false, message: "Unknown charity." };
  const { data: before } = await db.from("charity_private").select("bank_name, bank_account_last4, contact_email").eq("charity_id", id).maybeSingle();

  const { error } = await db
    .from("charity_private")
    .update({
      bank_name: v.bank_name,
      bank_account_holder: v.bank_account_holder,
      bank_account_number_encrypted: encrypt(v.bank_account_number),
      bank_account_last4: last4(v.bank_account_number),
      bank_branch_code: v.bank_branch_code,
      // The admin has checked the letter for this account.
      bank_verified_at: new Date().toISOString(),
    })
    .eq("charity_id", id);
  if (error) return failed(error);

  // The old account is still registered with the gateway: stop payments until it is connected again.
  const wasConnected = Boolean(charity.gateway_subaccount_ref);
  if (wasConnected) {
    const { error: unlink } = await db.from("charities").update({ gateway: null, gateway_subaccount_ref: null }).eq("id", id);
    if (unlink) return failed(unlink);
  }

  await logAudit({
    actorUserId: admin.userId,
    action: "charity.bank_details_changed",
    entityType: "charity",
    entityId: id,
    details: { from: { bank_name: before?.bank_name ?? null, last4: before?.bank_account_last4 ?? null }, to: { bank_name: v.bank_name, last4: last4(v.bank_account_number) }, gateway_disconnected: wasConnected },
  });

  if (before?.contact_email) {
    try {
      await getEmailTransport().send({
        to: before.contact_email as string,
        subject: `The bank details for ${charity.name_en} were changed`,
        text: [
          `The bank details held by Givezy for ${charity.name_en} were changed on ${formatDate(new Date())}. The new account ends in ${last4(v.bank_account_number)}.`,
          "",
          "If you did not ask for this, please tell us straight away.",
          "",
          "Givezy",
        ].join("\n"),
      });
    } catch (e) {
      console.error("[admin] bank change email not sent", e);
    }
  }
  refresh(id, charity.slug);
  return {
    ok: true,
    message: wasConnected
      ? "Saved and marked verified. The charity is off the payment gateway until you connect it again with the new account."
      : "Saved and marked verified.",
  };
}

/**
 * Take away someone's access to a charity (a volunteer who left, a lost account). Their sign-in
 * stays, as a donor; the charity's pages, exports and donor details close to them at once.
 */
export async function removeCharityAdmin(id: string, userId: string, _prev: FormState): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  if (!isUuid(id) || !isUuid(userId)) return { ok: false, message: "Unknown admin." };
  const db = createAdminClient();
  const { data: charity } = await db.from("charities").select("name_en").eq("id", id).maybeSingle();
  const { data: profile } = await db.from("profiles").select("email").eq("id", userId).maybeSingle();
  const { data, error } = await db.from("charity_admins").delete().eq("charity_id", id).eq("user_id", userId).select("user_id");
  if (error) return failed(error);
  if (!data?.length) return { ok: false, message: "That person no longer manages this charity." };
  await logAudit({ actorUserId: admin.userId, action: "charity.admin_removed", entityType: "charity", entityId: id, details: { email: profile?.email ?? null } });
  if (profile?.email && charity) await notifyCharity(adminRemovedEmail(profile.email as string, charity.name_en));
  refresh(id);
  return { ok: true, message: `${profile?.email ?? "That person"} can no longer manage this charity.` };
}

/**
 * Someone lost the phone with their authenticator app. After checking who they are (a call to a
 * number we already have, not one they give now), remove it so they can set up a new one. The
 * person is emailed, so the real owner hears about it if it wasn't them.
 */
export async function resetSecondStep(id: string, userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  if (!isUuid(id) || !isUuid(userId)) return { ok: false, message: "Unknown admin." };
  const how = String(formData.get("reason") ?? "").trim();
  if (how.length < 5) return { ok: false, fieldErrors: { reason: "Say how you checked it was really them" } };
  if (userId === admin.userId) return { ok: false, message: "You can't reset your own second step here. Ask another platform admin." };
  const db = createAdminClient();
  const member = await db.from("charity_admins").select("user_id").eq("charity_id", id).eq("user_id", userId).maybeSingle();
  if (!member.data) return { ok: false, message: "That person doesn't manage this charity." };
  const factors = await db.auth.admin.mfa.listFactors({ userId });
  if (factors.error) return failed(factors.error);
  const list = factors.data.factors ?? [];
  if (!list.length) return { ok: false, message: "They have no authenticator set up, so there is nothing to reset." };
  for (const f of list) {
    const del = await db.auth.admin.mfa.deleteFactor({ userId, id: f.id });
    if (del.error) return failed(del.error);
  }
  const { data: profile } = await db.from("profiles").select("email").eq("id", userId).maybeSingle();
  await logAudit({ actorUserId: admin.userId, action: "charity.admin_second_step_reset", entityType: "charity", entityId: id, details: { email: profile?.email ?? null, checked: how.slice(0, 500) } });
  if (profile?.email) await notifyCharity(secondStepResetEmail(profile.email as string));
  refresh(id);
  return { ok: true, message: "Reset. They'll set up a new authenticator app next time they sign in, and they've been emailed." };
}

/**
 * Add a document for the charity after it has applied (it can't, by design): a new SARS s18A
 * letter or a signed receipting mandate it emailed us. Kept with the others as the record.
 */
export async function adminUploadDocument(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  if (!isUuid(id)) return { ok: false, message: "Unknown charity." };
  const type = String(formData.get("document_type") ?? "") as DocumentType;
  const file = formData.get("file");
  const signedOn = String(formData.get("signed_on") ?? "").trim() || null;
  if (!Object.hasOwn(documentTypes, type)) return { ok: false, fieldErrors: { document_type: "Choose a document type" } };
  if (!(file instanceof File) || file.size === 0) return { ok: false, fieldErrors: { file: "Choose a file" } };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, fieldErrors: { file: "Files must be 4 MB or smaller" } };
  if (!(DOCUMENT_MIME as readonly string[]).includes(file.type) || !(await isRealDocument(file))) {
    return { ok: false, fieldErrors: { file: "Upload a PDF, JPG or PNG" } };
  }
  if (type === "receipting_mandate") {
    if (!signedOn || !/^\d{4}-\d{2}-\d{2}$/.test(signedOn)) return { ok: false, fieldErrors: { signed_on: "Enter the date the mandate was signed" } };
    if (signedOn > isoDateInJhb()) return { ok: false, fieldErrors: { signed_on: "The signing date can't be in the future" } };
  }
  const db = createAdminClient();
  const ext = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" }[file.type];
  const path = `${id}/${type}-${crypto.randomUUID()}.${ext}`;
  const upload = await db.storage.from("charity-documents").upload(path, file, { contentType: file.type, upsert: false });
  if (upload.error) return failed(upload.error);
  const { error } = await db.from("charity_documents").insert({
    charity_id: id,
    document_type: type,
    storage_path: path,
    file_name: file.name.slice(0, 200),
    signed_on: type === "receipting_mandate" ? signedOn : null,
    uploaded_by: admin.userId,
  });
  if (error) {
    await db.storage.from("charity-documents").remove([path]);
    return failed(error);
  }
  await logAudit({ actorUserId: admin.userId, action: "charity.document_added", entityType: "charity", entityId: id, details: { document_type: type } });
  refresh(id);
  return { ok: true, message: "Uploaded." };
}

/**
 * Set up s18A receipts for a charity that was approved without them (it got SARS approval later,
 * or the boxes weren't ticked at approval). Same checks as at approval.
 */
export async function setUpReceipts(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  const { charity, priv, documents } = await loadCharityForManager(id);
  if (charity.status !== "approved" && charity.status !== "suspended") return { ok: false, message: "Use the approval form for applications." };
  const reference = String(formData.get("s18a_reference") ?? "").trim().slice(0, 60);
  if (!reference) return { ok: false, fieldErrors: { s18a_reference: "Enter the s18A reference number from the SARS letter" } };
  const confirmS18a = formData.get("confirm_s18a") === "on";
  const confirmMandate = formData.get("confirm_mandate") === "on";
  if (!confirmS18a && !confirmMandate) return { ok: false, message: "Tick what you have confirmed." };

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { s18a_reference: reference };
  if (confirmS18a) {
    if (!documents.some((d) => d.document_type === "s18a_approval")) return { ok: false, message: "Upload the SARS s18A approval letter first." };
    update.is_s18a = true;
    update.s18a_confirmed_at = now;
  }
  if (confirmMandate) {
    const mandate = documents.filter((d) => d.document_type === "receipting_mandate").at(-1);
    if (!mandate?.signed_on) return { ok: false, message: "Upload the signed mandate, with its signing date, first." };
    update.mandate_signed_at = saMidnight(mandate.signed_on);
    update.mandate_document_path = mandate.storage_path;
  }
  const { error } = await createAdminClient().from("charities").update(update).eq("id", id);
  if (error) return failed(error);
  await logAudit({
    actorUserId: admin.userId,
    action: "charity.receipts_set_up",
    entityType: "charity",
    entityId: id,
    details: { s18a_reference: reference, s18a_confirmed: confirmS18a, mandate_confirmed: confirmMandate },
  });
  const ready = (confirmS18a || charity.is_s18a) && (confirmMandate || Boolean(charity.mandate_signed_at));
  if (ready && priv?.contact_email) await notifyCharity(receiptsReadyEmail(priv.contact_email, charity.name_en, id));
  refresh(id, charity.slug);
  return { ok: true, message: ready ? "s18A receipts are set up, and the charity has been emailed." : "Saved. Receipts start once both the s18A approval and the mandate are confirmed." };
}
