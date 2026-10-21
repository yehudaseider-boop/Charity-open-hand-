"use client";

import { ActionForm } from "@/components/forms/action-form";
import { TextField } from "@/components/forms/fields";
import type { FormState } from "@/lib/form";

/** Erase a guest donor by email. What was typed stays if something needs fixing. */
export function EraseByEmailForm({ action }: { action: (state: FormState, formData: FormData) => Promise<FormState> }) {
  return (
    <ActionForm action={action} submitLabel="Erase their information" confirm="Erase this person's information? This can't be undone.">
      <TextField name="email" label="Email address" type="email" required />
      <TextField name="again" label="Email address again" type="email" required />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="checked" className="mt-1" />
        <span>I have checked this is really the person.</span>
      </label>
    </ActionForm>
  );
}
