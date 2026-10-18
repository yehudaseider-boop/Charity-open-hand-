"use client";

import { ActionForm } from "@/components/forms/action-form";
import { TextArea, TextField } from "@/components/forms/fields";
import type { FormState } from "@/lib/form";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function CampaignForm({ action }: { action: Action }) {
  return (
    <ActionForm action={action} submitLabel="Start campaign" pendingLabel="Starting…" resetOnSuccess>
      <TextField name="title" label="Campaign name" required hint="Short and clear, for example: Winter food parcels." />
      <TextArea name="description" label="What it's for" rows={3} hint="One or two sentences donors will read. Real numbers only. Up to 500 characters." />
      <TextField name="target" label="Goal in Rand" required inputMode="numeric" hint="For example 50000. Donors see how close you are." />
      <TextField name="ends_on" label="Last day" type="date" hint="Leave empty to keep it open until you end it." />
    </ActionForm>
  );
}
