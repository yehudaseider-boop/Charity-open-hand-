"use client";

import { ActionForm } from "@/components/forms/action-form";
import { FileField, TextArea, TextField } from "@/components/forms/fields";
import type { FormState } from "@/lib/form";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function UpdateForm({ action }: { action: Action }) {
  return (
    <ActionForm action={action} submitLabel="Post update" resetOnSuccess>
      <TextArea name="body_en" label="Your update" required rows={4}
        hint="What you did with donations lately, in your own words. Up to 500 characters. Real numbers only." />
      <FileField name="file" label="Photo (optional)" accept="image/jpeg,image/png,image/webp" hint="JPG, PNG or WebP, up to 5 MB." />
    </ActionForm>
  );
}

export function PhotoForm({ action }: { action: Action }) {
  return (
    <ActionForm action={action} submitLabel="Add photo" resetOnSuccess>
      <FileField name="file" label="Photo" required accept="image/jpeg,image/png,image/webp" hint="JPG, PNG or WebP, up to 5 MB." />
      <TextField name="caption_en" label="Caption (optional)" hint="Up to 120 characters, for example: Packing parcels on a Thursday night." />
    </ActionForm>
  );
}
