"use client";

import { ActionForm } from "@/components/forms/action-form";
import { FileField, SelectField, TextField } from "@/components/forms/fields";
import { bankNames, documentTypes } from "@/lib/charity/validation";
import type { FormState } from "@/lib/form";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function OrganisationForm({ action, charity }: {
  action: Action;
  charity: {
    name_en: string; name_he: string | null; legal_name_en: string; legal_name_he: string | null;
    npo_number: string | null; pbo_number: string | null; s18a_reference: string | null;
  };
}) {
  return (
    <ActionForm action={action} submitLabel="Save">
      <TextField name="name_en" label="Name donors will see (English)" required defaultValue={charity.name_en} />
      <TextField name="name_he" label="Name in Hebrew" hebrew defaultValue={charity.name_he} />
      <TextField name="legal_name_en" label="Registered legal name" required defaultValue={charity.legal_name_en}
        hint="Exactly as on your NPO or PBO documents. This appears on s18A receipts." />
      <TextField name="legal_name_he" label="Registered legal name in Hebrew" hebrew defaultValue={charity.legal_name_he} />
      <TextField name="npo_number" label="NPO number" defaultValue={charity.npo_number} hint="For example 123-456 NPO" />
      <TextField name="pbo_number" label="PBO reference number" defaultValue={charity.pbo_number}
        hint="Enter an NPO number, a PBO number, or both." />
      <TextField name="s18a_reference" label="s18A reference number" defaultValue={charity.s18a_reference}
        hint="Only if SARS has approved you to issue s18A receipts." />
    </ActionForm>
  );
}

export function AddressForm({ action, charity }: {
  action: Action;
  charity: { address_line1: string | null; address_line2: string | null; suburb: string | null; city: string | null; postal_code: string | null };
}) {
  return (
    <ActionForm action={action} submitLabel="Save">
      <TextField name="address_line1" label="Street address" required defaultValue={charity.address_line1} autoComplete="address-line1" />
      <TextField name="address_line2" label="Unit or building" defaultValue={charity.address_line2} autoComplete="address-line2" />
      <TextField name="suburb" label="Suburb" defaultValue={charity.suburb} />
      <TextField name="city" label="City" required defaultValue={charity.city} autoComplete="address-level2" />
      <TextField name="postal_code" label="Postal code" required inputMode="numeric" defaultValue={charity.postal_code} autoComplete="postal-code" />
    </ActionForm>
  );
}

export function ContactForm({ action, priv }: {
  action: Action;
  priv: { contact_name: string | null; contact_email: string | null; contact_phone: string | null } | null;
}) {
  return (
    <ActionForm action={action} submitLabel="Save">
      <TextField name="contact_name" label="Full name" required defaultValue={priv?.contact_name} autoComplete="name" />
      <TextField name="contact_email" label="Email" type="email" required defaultValue={priv?.contact_email} autoComplete="email" />
      <TextField name="contact_phone" label="Phone" type="tel" defaultValue={priv?.contact_phone} autoComplete="tel" />
    </ActionForm>
  );
}

export function BankForm({ action, priv }: {
  action: Action;
  priv: { bank_name: string | null; bank_account_holder: string | null; bank_account_last4: string | null; bank_branch_code: string | null } | null;
}) {
  return (
    <ActionForm action={action} submitLabel="Save bank details">
      <SelectField name="bank_name" label="Bank" required defaultValue={priv?.bank_name}
        options={bankNames.map((b) => ({ value: b, label: b }))} />
      <TextField name="bank_account_holder" label="Account holder" required defaultValue={priv?.bank_account_holder}
        hint="Must be the organisation itself, not a person." />
      <TextField name="bank_account_number" label="Account number" required inputMode="numeric"
        hint={priv?.bank_account_last4 ? `Saved account ends in ${priv.bank_account_last4}. Re-enter it to save changes.` : "Digits only."} />
      <TextField name="bank_branch_code" label="Branch code" required inputMode="numeric" defaultValue={priv?.bank_branch_code} />
    </ActionForm>
  );
}

export function UploadForm({ action, showMandateDate }: { action: Action; showMandateDate: boolean }) {
  return (
    <ActionForm action={action} submitLabel="Upload" resetOnSuccess>
      <SelectField name="document_type" label="Document" required
        options={Object.entries(documentTypes).map(([value, label]) => ({ value, label }))} />
      <FileField name="file" label="File" required accept="application/pdf,image/jpeg,image/png" hint="PDF, JPG or PNG, up to 5 MB." />
      {showMandateDate ? (
        <TextField name="signed_on" label="Date the mandate was signed" type="date"
          hint="Only needed for the receipting mandate." />
      ) : null}
    </ActionForm>
  );
}

export function SubmitForm({ action }: { action: (state: FormState) => Promise<FormState> }) {
  return (
    <ActionForm action={action} submitLabel="Submit for review"
      confirm="Submit now? You won't be able to change your details or bank account while we review them." />
  );
}
