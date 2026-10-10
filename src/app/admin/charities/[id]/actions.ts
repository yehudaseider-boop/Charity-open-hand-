"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth";
import { applicationChecklist, isComplete } from "@/lib/charity/checklist";
import { loadCharityForManager } from "@/lib/charity/queries";
import { decrypt } from "@/lib/crypto";
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
  await logAudit({
    actorUserId: admin.userId,
    action: "charity.approved",
    entityType: "charity",
    entityId: id,
    details: { s18a_confirmed: confirmS18a, mandate_confirmed: confirmMandate },
  });
  refresh(id, charity.slug);
  return { ok: true, message: "Approved." };
}

function reasonFrom(formData: FormData) {
  const reason = String(formData.get("reason") ?? "").trim();
  return reason.length >= 5 ? reason.slice(0, 2000) : null;
}

export async function rejectCharity(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  const { charity } = await loadCharityForManager(id);
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
  refresh(id);
  return { ok: true, message: "Sent back to the charity." };
}

export async function suspendCharity(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  const { charity } = await loadCharityForManager(id);
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
  refresh(id, charity.slug);
  return { ok: true, message: "Suspended. The charity is hidden and can't receive donations." };
}

export async function reinstateCharity(id: string, _prev: FormState): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  const { charity } = await loadCharityForManager(id);
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
  if (!profile) {
    const created = await db.auth.admin.createUser({ email, email_confirm: true });
    if (created.error) return { ok: false, message: created.error.message };
    profile = { id: created.data.user.id };
  }
  const { error } = await db
    .from("charity_admins")
    .upsert({ charity_id: id, user_id: profile.id, role: "admin" }, { onConflict: "charity_id,user_id", ignoreDuplicates: true });
  if (error) return failed(error);
  await logAudit({ actorUserId: admin.userId, action: "charity.admin_added", entityType: "charity", entityId: id, details: { email } });
  refresh(id);
  return { ok: true, message: `${email} can now sign in and manage this charity.` };
}

export async function connectToGateway(id: string, _prev: FormState): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  const { charity } = await loadCharityForManager(id);
  if (charity.status !== "approved") return { ok: false, message: "Approve the charity first." };

  const db = createAdminClient();
  const { data: priv } = await db
    .from("charity_private")
    .select("bank_name, bank_account_holder, bank_account_number_encrypted, bank_branch_code")
    .eq("charity_id", id)
    .single();
  if (!priv?.bank_account_number_encrypted || !priv.bank_name || !priv.bank_branch_code) {
    return { ok: false, message: "Bank details are incomplete." };
  }

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
  refresh(id, charity.slug);
  return { ok: true, message: "Connected. The charity can now take donations." };
}
