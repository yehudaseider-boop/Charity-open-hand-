"use client";

import { ActionForm } from "@/components/forms/action-form";
import { DateField, TextArea, TextField } from "@/components/forms/fields";
import type { FormState } from "@/lib/form";

type Action = (s: FormState, f: FormData) => Promise<FormState>;

export function NoteForm({ action, defaultBody, label = "Add a note", submit = "Save note" }: { action: Action; defaultBody?: string; label?: string; submit?: string }) {
  return (
    <ActionForm action={action} submitLabel={submit} pendingLabel="Saving…" resetOnSuccess={!defaultBody}>
      <TextArea name="body" label={label} required rows={3} maxLength={2000} defaultValue={defaultBody ?? ""} hint="Only people who manage your charity on Givezy see notes. Donors can ask what's held about them, so write what you'd be happy for them to read." />
    </ActionForm>
  );
}

export function ReminderForm({ action, today }: { action: Action; today: string }) {
  return (
    <ActionForm action={action} submitLabel="Add follow-up" pendingLabel="Saving…" resetOnSuccess>
      <TextField name="what" label="What to do" required maxLength={300} />
      <DateField name="due_on" label="When" required defaultValue={today} />
    </ActionForm>
  );
}

export function TagForm({ action, existing }: { action: Action; existing: string[] }) {
  return (
    <ActionForm action={action} submitLabel="Add tag" pendingLabel="Adding…" resetOnSuccess>
      <TextField name="name" label="Tag" required maxLength={40} hint={existing.length ? `Type a new tag, or one you use already: ${existing.slice(0, 8).join(", ")}${existing.length > 8 ? "…" : ""}` : "For example Board member, Volunteer, Heroes with Halos"} />
    </ActionForm>
  );
}

/** A one-button form (Done, Undo, Remove), asking first when it can't be taken back. */
export function ButtonForm({ action, label, pending, confirm, confirmLabel }: { action: Action; label: string; pending: string; confirm?: string; confirmLabel?: string }) {
  return <ActionForm action={action} submitLabel={label} pendingLabel={pending} confirm={confirm} confirmLabel={confirmLabel} />;
}

export function SaveListForm({ action }: { action: Action }) {
  return (
    <ActionForm action={action} submitLabel="Save this list" pendingLabel="Saving…" resetOnSuccess>
      <TextField name="name" label="Name for this list" required maxLength={60} hint="Saves the group, tag and search you have chosen, so you can open the same list again." />
    </ActionForm>
  );
}

export function LapsedForm({ action, days }: { action: Action; days: number }) {
  return (
    <ActionForm action={action} submitLabel="Save" pendingLabel="Saving…">
      <TextField name="days" label="Lapsed after this many days without a gift" required inputMode="numeric" maxLength={3} defaultValue={String(days)} hint="Between 30 and 730. Givezy's default is 180 (about 6 months)." />
    </ActionForm>
  );
}
