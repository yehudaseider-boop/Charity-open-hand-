"use client";

import { ActionForm } from "@/components/forms/action-form";
import { CheckboxGroup, FileField, TextArea, TextField } from "@/components/forms/fields";
import type { FormState } from "@/lib/form";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function ProfileForm({ action, charity, categories, selected }: {
  action: Action;
  charity: { name_en: string; description_en: string | null; funds_use_en: string | null; thank_you_en: string | null; website: string | null };
  categories: { id: string; name_en: string }[];
  selected: string[];
}) {
  return (
    <ActionForm action={action} submitLabel="Save profile">
      <TextField name="name_en" label="Name" required defaultValue={charity.name_en} />
      <TextArea name="description_en" label="What you do" defaultValue={charity.description_en}
        hint="A few sentences donors read first. Who you help and how." />
      <TextArea name="funds_use_en" label="How donations are used" defaultValue={charity.funds_use_en}
        hint="What a donation pays for, for example Shabbos parcels for families or a teacher's salary. Specific is best." />
      <TextArea name="thank_you_en" label="Thank-you note to donors" defaultValue={charity.thank_you_en}
        hint="Shown in the NEDIV lev app when a donation to you arrives. Up to 300 characters, in your own words." />
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
