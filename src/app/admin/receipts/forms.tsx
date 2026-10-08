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
