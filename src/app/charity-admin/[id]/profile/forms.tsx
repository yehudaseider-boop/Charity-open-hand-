"use client";

import { ActionForm } from "@/components/forms/action-form";
import { CheckboxGroup, FileField, TextArea, TextField } from "@/components/forms/fields";
import type { FormState } from "@/lib/form";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function ProfileForm({ action, charity, categories, selected }: {
  action: Action;
  charity: { name_en: string; description_en: string | null; funds_use_en: string | null; thank_you_en: string | null; impact_en: string | null; suggested_amounts_cents: number[] | null; website: string | null };
  categories: { id: string; name_en: string }[];
  selected: string[];
}) {
  return (
    <ActionForm action={action} submitLabel="Save profile">
      <TextField name="name_en" label="Name" required defaultValue={charity.name_en} />
      <TextArea name="description_en" label="What you do" defaultValue={charity.description_en}
        hint="A few sentences donors read first. Who you help and how." />
      <TextArea name="funds_use_en" label="How donations are used" defaultValue={charity.funds_use_en}
        hint="What a donation pays for, for example food parcels for families or a teacher's salary. Specific is best." />
      <TextField name="impact_en" label="Your impact line" defaultValue={charity.impact_en}
        hint="One line on what a gift does, in your own numbers, for example: R180 feeds a family for a week. Shown with your photo in the app. Up to 140 characters." />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Suggested amounts</legend>
        <p className="text-sm text-muted">
          Up to three amounts donors can tap when they give, for example 180, 360 and 1 000. Leave them empty and donors type their own.
          Someone who has given before also sees their own last amounts.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => {
            const c = charity.suggested_amounts_cents?.[i];
            return <TextField key={i} name={`suggested_${i + 1}`} label={`Amount ${i + 1} (R)`} inputMode="numeric" defaultValue={c ? centsToRandInput(c) : ""} />;
          })}
        </div>
      </fieldset>
      <TextArea name="thank_you_en" label="Thank-you note to donors" defaultValue={charity.thank_you_en}
        hint="Shown in the Givezy app when a donation to you arrives. Up to 300 characters, in your own words." />
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

export function DonationEmailsForm({ action, on, email }: { action: Action; on: boolean; email: string | null }) {
  return (
    <ActionForm action={action} submitLabel="Save">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="notify_donations" defaultChecked={on} className="mt-1" />
        <span>Email me when a donation comes in{email ? <> (to {email})</> : null}. The email shows the amount only, never who gave.</span>
      </label>
    </ActionForm>
  );
}

/** Whole cents as the Rand amount typed in a box: "180" or "180.50". */
function centsToRandInput(c: number): string {
  const r = Math.floor(c / 100), k = c % 100;
  return k ? `${r}.${String(k).padStart(2, "0")}` : String(r);
}
