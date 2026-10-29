"use client";

import { ActionForm } from "@/components/forms/action-form";
import { TextArea } from "@/components/forms/fields";
import type { FormState } from "@/lib/form";

/** "Say thank you" under one donor: folded away until opened, and it asks before sending. */
export function ThankOneForm({ action, name }: { action: (s: FormState, f: FormData) => Promise<FormState>; name: string }) {
  return (
    <details className="relative z-10 mt-3 rounded-control border-2 border-border bg-surface px-3 py-1 transition hover:border-brand/60 focus-within:border-brand/60">
      <summary className="min-h-11 cursor-pointer content-center font-semibold text-brand">Say thank you</summary>
      <div className="mt-1 pb-2">
        <ActionForm
          action={action}
          submitLabel="Send thank-you"
          pendingLabel="Sending…"
          confirm={`Send this thank-you to ${name}? An email can't be called back once it's sent.`}
          confirmLabel="Yes, send it"
        >
          <TextArea
            name="body"
            label="Your thank-you"
            required
            rows={4}
            maxLength={1000}
            hint="Up to 1 000 characters. Plain text. They see their first name above it and your charity's name below. Replies go to your contact email."
          />
        </ActionForm>
      </div>
    </details>
  );
}
