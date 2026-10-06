"use client";

import { ActionForm } from "@/components/forms/action-form";
import { CheckboxGroup, FileField, TextArea, TextField } from "@/components/forms/fields";
import type { FormState } from "@/lib/form";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function ProfileForm({ action, charity, categories, selected }: {
  action: Action;
  charity: { name_en: string; name_he: string | null; description_en: string | null; description_he: string | null; website: string | null };
  categories: { id: string; name_en: string; name_he: string | null }[];
  selected: string[];
}) {
  return (
    <ActionForm action={action} submitLabel="Save profile">
      <TextField name="name_en" label="Name (English)" required defaultValue={charity.name_en} />
      <TextField name="name_he" label="Name (Hebrew)" hebrew defaultValue={charity.name_he} />
      <TextArea name="description_en" label="About your organisation (English)" defaultValue={charity.description_en} />
      <TextArea name="description_he" label="About your organisation (Hebrew)" hebrew defaultValue={charity.description_he} />
      <TextField name="website" label="Website" type="url" defaultValue={charity.website} hint="For example https://example.org.za" />
      <CheckboxGroup name="category_ids" label="Categories"
        options={categories.map((c) => ({ value: c.id, label: c.name_en }))} defaultValues={selected} />
    </ActionForm>
  );
}

export function ImageForm({ action, label }: { action: Action; label: string }) {
  return (
    <ActionForm action={action} submitLabel="Upload" resetOnSuccess>
      <FileField name="file" label={label} required accept="image/jpeg,image/png,image/webp" hint="JPG, PNG or WebP, up to 5 MB." />
    </ActionForm>
  );
}
