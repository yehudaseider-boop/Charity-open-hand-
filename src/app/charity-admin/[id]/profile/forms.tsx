"use client";

import { ActionForm } from "@/components/forms/action-form";
import { useState } from "react";
import { CheckboxGroup, DateField, ErrorMark, FileField, TextArea, TextField, useFieldId } from "@/components/forms/fields";
import { useFieldError } from "@/components/forms/action-form";
import { checkImpactUnit, impactLine, impactSource } from "@/lib/charity/impact";
import type { FormState } from "@/lib/form";
import { FOCUS_MAX_DAYS, FOCUS_MESSAGE_MAX, FOCUS_TITLE_MAX } from "@/lib/charity/focus";

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

/** The profile video: a YouTube or Vimeo link. The server keeps only which site and which video. */
export function VideoForm({ action, link }: { action: Action; link: string | null }) {
  return (
    <ActionForm action={action} submitLabel={link ? "Save video" : "Add video"}>
      <TextField name="video_url" label="Link to your video on YouTube or Vimeo" type="url" inputMode="url" autoComplete="off" maxLength={300} defaultValue={link}
        hint="Open the video on YouTube or Vimeo, copy its link and paste it here, for example https://youtu.be/… The video must be public. We don't store the video itself." />
    </ActionForm>
  );
}

/** A second, smaller form beside a main one: "Remove video", "Remove focus". The page offers Undo afterwards. */
export function RemoveForm({ action, label }: { action: Action; label: string }) {
  return <ActionForm action={action} submitLabel={label} pendingLabel="Removing…" />;
}

/**
 * The charity's own focus: one of its running campaigns or a typed title, a short message, and the first and
 * last day it shows.
 */
export function FocusForm({ action, focus, campaigns }: {
  action: Action;
  focus: { campaign_id: string | null; title: string; message: string; starts_on: string; ends_on: string } | null;
  campaigns: { id: string; title: string }[];
}) {
  const [left, setLeft] = useState(FOCUS_MESSAGE_MAX - (focus?.message.length ?? 0));
  // A title that is only the campaign's own name is shown as empty: it follows the campaign.
  const fromCampaign = focus?.campaign_id ? campaigns.find((c) => c.id === focus.campaign_id) : undefined;
  return (
    <ActionForm action={action} submitLabel="Save focus">
      {campaigns.length ? <CampaignSelect campaigns={campaigns} defaultValue={fromCampaign?.id ?? ""} /> : null}
      <TextField name="title" label="Title" autoDirection maxLength={FOCUS_TITLE_MAX} required={!campaigns.length}
        defaultValue={focus && focus.title !== fromCampaign?.title ? focus.title : ""}
        hint={campaigns.length ? "A few words, for example: Winter blankets. Leave it empty to use the campaign's name." : "A few words, for example: Winter blankets."} />
      <div onInput={(e) => { const t = e.target as HTMLTextAreaElement; if (t.name === "message") setLeft(FOCUS_MESSAGE_MAX - t.value.length); }}>
        <TextArea name="message" label="Short message" required rows={3} maxLength={FOCUS_MESSAGE_MAX} defaultValue={focus?.message}
          hint={`One or two sentences, in your own words, on what you're working on and why now. Up to ${FOCUS_MESSAGE_MAX} characters.`} />
        <p className="mt-1 text-xs text-muted" aria-live="polite">{left} {left === 1 ? "character" : "characters"} left</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <DateField name="starts_on" label="First day it shows" required defaultValue={focus?.starts_on} />
        <DateField name="ends_on" label="Last day it shows" required defaultValue={focus?.ends_on} hint={`Up to ${FOCUS_MAX_DAYS} days after the first day.`} />
      </div>
    </ActionForm>
  );
}

function CampaignSelect({ campaigns, defaultValue }: { campaigns: { id: string; title: string }[]; defaultValue: string }) {
  const error = useFieldError("campaign_id");
  const id = useFieldId("campaign_id");
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-semibold">Campaign <span className="font-normal text-muted">(optional)</span></label>
      <select id={id} name="campaign_id" defaultValue={defaultValue} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : `${id}-hint`}
        className="w-full rounded-[0.875rem] border-2 border-border bg-surface px-3.5 py-2.5 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand-soft aria-invalid:border-danger">
        <option value="">No campaign: gifts go to your general giving</option>
        {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
      {error ? (
        <p id={`${id}-error`} role="alert" className="flex items-start gap-1.5 text-sm font-semibold text-danger"><ErrorMark /><span>{error}</span></p>
      ) : (
        <p id={`${id}-hint`} className="text-xs text-muted">Choose one of your running campaigns and the give button goes to it.</p>
      )}
    </div>
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
