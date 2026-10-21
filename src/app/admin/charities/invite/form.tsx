"use client";

import { ActionForm } from "@/components/forms/action-form";
import { TextField } from "@/components/forms/fields";
import { inviteCharity } from "./actions";

export function InviteForm() {
  return (
    <ActionForm action={inviteCharity} submitLabel="Send invitation" resetOnSuccess>
      <TextField name="charity_name" label="Charity's name" required hint="It is filled in for them when they start." />
      <TextField name="contact_email" label="Contact email" type="email" required hint="Who should get the link. It works once, for 30 days." />
    </ActionForm>
  );
}
