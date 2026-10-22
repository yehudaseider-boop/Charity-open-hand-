"use client";

import { ActionForm } from "@/components/forms/action-form";
import { useState } from "react";
import { CheckboxGroup, FileField, TextArea, TextField } from "@/components/forms/fields";
import { checkImpactUnit, impactLine, impactSource } from "@/lib/charity/impact";
import type { FormState } from "@/lib/form";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function ProfileForm({ action, charity, categories, selected }: {
  action: Action;
  charity: { name_en: string; description_en: string | null; funds_use_en: string | null; thank_you_en: string | null; impact_en: string | null; suggested_amounts_cents: number[] | null; website: string | null;
    impact_unit_cents: number | null; impact_unit_one: string | null; impact_unit_many: string | null };
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
        hint="One line on what a donation does, in your own numbers, for example: R180 feeds a family for a week. Shown with your photo in the app. Up to 140 characters." />
      <ImpactUnitFields charityName={charity.name_en} cents={charity.impact_unit_cents} one={charity.impact_unit_one} many={charity.impact_unit_many} />
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
    <ActionForm action={action} submitLabel="Upload" pendingLabel="Uploading…" resetOnSuccess>
      <FileField name="file" label={label} required accept="image/jpeg,image/png,image/webp" hint="JPG, PNG or WebP, up to 4 MB." />
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

/**
 * What one gift pays for, in the charity's own figure. With it set, donors see "Your R360 pays for 30 school
 * breakfasts" while they choose an amount and after they give. A live example shows how it will read.
 */
function ImpactUnitFields({ charityName, cents, one, many }: { charityName: string; cents: number | null; one: string | null; many: string | null }) {
  const [typed, setTyped] = useState({ amount: cents ? centsToRandInput(Number(cents)) : "", one: one ?? "", many: many ?? "" });
  const checked = checkImpactUnit(typed);
  const unit = checked.ok ? checked.unit : null;
  const example = unit ? impactLine(unit.cents * 30 > 100_000_00 ? unit.cents * 2 : unit.cents * 30, unit, { you: true }) : null;
  const set = (k: "amount" | "one" | "many") => (e: React.FormEvent<HTMLFieldSetElement>) => {
    const t = e.target as HTMLInputElement;
    if (t.name === `impact_unit_${k}`) setTyped((v) => ({ ...v, [k]: t.value }));
  };
  return (
    <fieldset className="space-y-2" onInput={(e) => { set("amount")(e); set("one")(e); set("many")(e); }}>
      <legend className="text-sm font-medium">What one gift pays for <span className="font-normal text-muted">(optional)</span></legend>
      <p className="text-sm text-muted">
        Your own figure for one thing a donation pays for. Donors then see what their gift pays for while they choose an amount and after they give,
        always with your name on the figure. Only use a figure you can stand behind. Leave all three empty to show none.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <TextField name="impact_unit_amount" label="One costs (R)" inputMode="decimal" defaultValue={cents ? centsToRandInput(Number(cents)) : ""} />
        <TextField name="impact_unit_one" label="Called (one)" maxLength={60} defaultValue={one} hint="For example: school breakfast" />
        <TextField name="impact_unit_many" label="Called (many)" maxLength={60} defaultValue={many} hint="For example: school breakfasts" />
      </div>
      {unit && example ? (
        <p className="rounded-control bg-honey-soft p-3 text-sm" aria-live="polite">
          <span className="font-semibold">Donors will see:</span> {example}. <span className="text-muted">{impactSource(charityName, unit)}</span>
        </p>
      ) : null}
    </fieldset>
  );
}

/** Whole cents as the Rand amount typed in a box: "180" or "180.50". */
function centsToRandInput(c: number): string {
  const r = Math.floor(c / 100), k = c % 100;
  return k ? `${r}.${String(k).padStart(2, "0")}` : String(r);
}
