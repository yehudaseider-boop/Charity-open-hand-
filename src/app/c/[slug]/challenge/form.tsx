"use client";

import { ActionForm } from "@/components/forms/action-form";
import { TextArea, TextField } from "@/components/forms/fields";
import type { FormState } from "@/lib/form";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function ChallengeForm({ action, charityName, minLabel }: { action: Action; charityName: string; minLabel: string }) {
  return (
    <ActionForm action={action} submitLabel="Start the challenge">
      <TextField name="title" label="Name your challenge" required hint={`Short and clear, for example: Our office feeds 50 families.`} />
      <TextArea name="reason" label="Why you're doing it" rows={3} hint={`A sentence or two your friends will read about why ${charityName} matters to you. Up to 500 characters.`} />
      <TextField name="target" label="Goal in Rand" required inputMode="numeric" hint={`At least ${minLabel}. Everyone sees how close you are.`} />
      <TextField name="ends_on" label="Last day" type="date" hint="Leave empty to keep it open." />
      <TextField name="starter_name" label="Name to show" required autoComplete="given-name" hint={`Shown as "Started by ...". Your first name is enough. Your email is never shown.`} />
    </ActionForm>
  );
}
