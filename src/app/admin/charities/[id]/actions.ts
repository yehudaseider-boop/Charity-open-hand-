"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth";
import { applicationChecklist, isComplete } from "@/lib/charity/checklist";
import { loadCharityForManager } from "@/lib/charity/queries";
import { decrypt, encrypt, last4 } from "@/lib/crypto";
import { bankSchema } from "@/lib/charity/validation";
import { formatDate } from "@/lib/dates";
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
  const { charity } = await loadCharityForManager(id);
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
  refresh(id, charity.slug);
  return { ok: true, message: "Connected. The charity can now take donations." };
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
