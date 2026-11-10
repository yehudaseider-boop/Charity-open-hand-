"use client";

import { ActionForm } from "@/components/forms/action-form";
import { SelectField, TextField } from "@/components/forms/fields";
import { ASSIGNABLE_ROLES, ROLE_LABEL, ROLE_SUMMARY, type Role } from "@/lib/charity/permissions";
import type { FormState } from "@/lib/form";

const ROLE_OPTIONS = ASSIGNABLE_ROLES.map((r) => ({ value: r, label: `${ROLE_LABEL[r]}: ${ROLE_SUMMARY[r]}` }));

export function AddMemberForm({ action }: { action: (s: FormState, f: FormData) => Promise<FormState> }) {
  return (
    <ActionForm action={action} submitLabel="Give access" pendingLabel="Adding…" resetOnSuccess>
      <TextField name="email" label="Their email address" type="email" required maxLength={254} autoComplete="off" hint="They sign in with this address. We email them how." />
      <SelectField name="role" label="Their role" required options={ROLE_OPTIONS} defaultValue="admin" hint="You can change it later." />
    </ActionForm>
  );
}

export function RemoveMemberForm({ action, email, self }: { action: (s: FormState, f: FormData) => Promise<FormState>; email: string; self: boolean }) {
  return (
    <ActionForm
      action={action}
      submitLabel={self ? "Remove myself" : "Remove"}
      pendingLabel="Removing…"
      confirm={self ? "Remove yourself from this charity? You'll lose access to its dashboard straight away. Another owner can add you back." : `Remove ${email}? They lose access to your dashboard and donors' details straight away. You can add them again later.`}
      confirmLabel="Yes, remove"
    />
  );
}

/** Change someone's role. Takes effect the next time they open a page; Undo puts it back. */
export function RoleForm({ action, current }: { action: (s: FormState, f: FormData) => Promise<FormState>; current: Role }) {
  return (
    <ActionForm action={action} submitLabel="Change role" pendingLabel="Changing…">
      <input type="hidden" name="was" value={current} />
      <SelectField name="role" label="Role" required options={ROLE_OPTIONS} defaultValue={current} />
    </ActionForm>
  );
}
