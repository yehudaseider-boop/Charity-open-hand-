"use client";

import { ActionForm } from "@/components/forms/action-form";
import { sendDataRequest } from "../actions";

/** One button that asks first, then files the same delete request as the form on Your information. */
export function DeleteForm() {
  return (
    <ActionForm
      action={sendDataRequest}
      submitLabel="Delete my account"
      pendingLabel="Sending…"
      confirm="Delete your account? This can't be undone once we've processed it."
      confirmLabel="Yes, delete my account"
    >
      <input type="hidden" name="kind" value="delete" />
    </ActionForm>
  );
}
