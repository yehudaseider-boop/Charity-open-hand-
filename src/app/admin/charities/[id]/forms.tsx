"use client";

import { ActionForm } from "@/components/forms/action-form";
import { SelectField, TextArea, TextField } from "@/components/forms/fields";
import { bankNames } from "@/lib/charity/validation";
import type { FormState } from "@/lib/form";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

function Check({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} className="mt-1" />
      <span>{children}</span>
    </label>
  );
}

export function ApproveForm({ action, hasS18a, hasMandate }: { action: Action; hasS18a: boolean; hasMandate: boolean }) {
  return (
    <ActionForm action={action} submitLabel="Approve" confirm="Approve this charity and make it public?">
      <Check name="confirm_verified">
        I have vetted this organisation: its registration, documents and bank confirmation letter match the details
        entered. (Gives the &quot;Verified&quot; badge.)
      </Check>
      {hasS18a ? (
        <Check name="confirm_s18a">I have confirmed the s18A approval with SARS documents.</Check>
      ) : null}
      {hasMandate ? (
        <Check name="confirm_mandate">The receipting mandate is properly signed. (With s18A, gives the &quot;s18A&quot; badge.)</Check>
      ) : null}
    </ActionForm>
  );
}

export function ReasonForm({ action, label, submitLabel, confirm }: { action: Action; label: string; submitLabel: string; confirm?: string }) {
  return (
    <ActionForm action={action} submitLabel={submitLabel} confirm={confirm}>
      <TextArea name="reason" label={label} required rows={3} />
    </ActionForm>
  );
}

export function SimpleForm({ action, submitLabel, confirm }: { action: (s: FormState) => Promise<FormState>; submitLabel: string; confirm?: string }) {
  return <ActionForm action={action} submitLabel={submitLabel} confirm={confirm} />;
}

export function AddAdminForm({ action }: { action: Action }) {
  return (
    <ActionForm action={action} submitLabel="Add admin">
      <TextField name="email" label="Email" type="email" required />
    </ActionForm>
  );
}

export function ChangeBankForm({ action, current }: { action: Action; current: { bank_name: string | null; bank_account_holder: string | null; bank_branch_code: string | null } }) {
  return (
    <ActionForm
      action={action}
      submitLabel="Change bank details"
      confirm="Change this charity's bank details? It will come off the payment gateway until you connect it again, and its contact will be emailed."
    >
      <SelectField name="bank_name" label="Bank" required defaultValue={current.bank_name} options={bankNames.map((b) => ({ value: b, label: b }))} />
      <TextField name="bank_account_holder" label="Account holder" required defaultValue={current.bank_account_holder ?? ""} />
      <TextField name="bank_account_number" label="Account number" required inputMode="numeric" autoComplete="off" hint="6 to 16 digits." />
      <TextField name="bank_branch_code" label="Branch code" required inputMode="numeric" defaultValue={current.bank_branch_code ?? ""} hint="6 digits." />
      <Check name="checked_letter">I have checked the bank confirmation letter for this account.</Check>
    </ActionForm>
  );
}
