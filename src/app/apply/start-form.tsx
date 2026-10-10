"use client";

import { ActionForm } from "@/components/forms/action-form";
import { TextField } from "@/components/forms/fields";
import { startApplication } from "./actions";

export function StartForm() {
  return (
    <ActionForm action={startApplication} submitLabel="Start application">
      <TextField name="name_en" label="Organisation name" required autoComplete="organization" />
    </ActionForm>
  );
}
