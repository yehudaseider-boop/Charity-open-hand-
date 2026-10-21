"use client";

import { ActionForm } from "@/components/forms/action-form";
import { TextField } from "@/components/forms/fields";
import type { FormState } from "@/lib/form";

export function AddMemberForm({ action }: { action: (s: FormState, f: FormData) => Promise<FormState> }) {
  return (
    <ActionForm action={action} submitLabel="Give access" pendingLabel="Adding…" resetOnSuccess>
      <TextField name="email" label="Their email address" type="email" required maxLength={254} autoComplete="off" hint="They sign in with this address. We email them how." />
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
