"use client";

import { ActionForm } from "@/components/forms/action-form";
import { TextArea } from "@/components/forms/fields";
import type { FormState } from "@/lib/form";

export function ThankYouForm({ action, defaultBody, confirm }: { action: (s: FormState, f: FormData) => Promise<FormState>; defaultBody: string; confirm: string }) {
  return (
    <ActionForm action={action} submitLabel="Send thank-you" confirm={confirm}>
      <TextArea name="body" label="Your thank-you" required rows={5} defaultValue={defaultBody} hint="Up to 1 000 characters. Plain text. Each donor sees their own first name above it, and nothing about other donors." />
    </ActionForm>
  );
}
