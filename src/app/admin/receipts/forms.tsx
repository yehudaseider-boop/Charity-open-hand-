"use client";

import { ActionForm } from "@/components/forms/action-form";
import { TextArea } from "@/components/forms/fields";
import type { FormState } from "@/lib/form";

export function VoidForm({ action }: { action: (state: FormState, formData: FormData) => Promise<FormState> }) {
  return (
    <ActionForm
      action={action}
      submitLabel="Withdraw receipt"
      confirm="Withdraw this receipt? The donor can no longer download it. It stays on record."
    >
      <TextArea name="reason" label="Reason (kept on record)" required rows={2} />
    </ActionForm>
  );
}

export function SignOffForm({ action, count, total }: { action: (s: FormState, f: FormData) => Promise<FormState>; count: number; total: string }) {
  return (
    <ActionForm
      action={action}
      submitLabel="Sign off and issue"
      pendingLabel="Issuing receipts…"
      confirm={`Issue ${count} s18A ${count === 1 ? "receipt" : "receipts"} (${total}) and email them to the donors? Issued receipts can only be withdrawn one by one.`}
      confirmLabel="Yes, issue them"
    />
  );
}

export function SendBackForm({ action }: { action: (s: FormState, f: FormData) => Promise<FormState> }) {
  return (
    <ActionForm action={action} submitLabel="Send back to the charity" pendingLabel="Sending back…">
      <TextArea name="reason" label="Why (the charity sees this)" required rows={2} maxLength={300} />
    </ActionForm>
  );
}

export function FinishForm({ action }: { action: (s: FormState, f: FormData) => Promise<FormState> }) {
  return <ActionForm action={action} submitLabel="Finish" pendingLabel="Finishing…" />;
}
