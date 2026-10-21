"use client";

import { ActionForm } from "@/components/forms/action-form";
import { TextField } from "@/components/forms/fields";
import { startApplication } from "./actions";

export function StartForm({ defaultName, invite }: { defaultName?: string; invite?: string }) {
  return (
    <ActionForm action={startApplication} submitLabel="Start application">
      <TextField name="name_en" label="Organisation name" required autoComplete="organization" defaultValue={defaultName} />
      {invite ? <input type="hidden" name="invite" value={invite} /> : null}
    </ActionForm>
  );
}
