"use client";

import { ActionForm } from "@/components/forms/action-form";
import { sendDataRequest } from "./actions";

export function RequestForm() {
  return (
    <ActionForm action={sendDataRequest} submitLabel="Send request">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">I&apos;d like you to</legend>
        {([
          ["correct", "Correct my information"],
          ["delete", "Delete my account and information"],
          ["object", "Stop using my information for something"],
        ] as const).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input type="radio" name="kind" value={value} required />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Details (optional)</span>
        <textarea name="details" rows={3} maxLength={2000} className="w-full rounded-control border border-border bg-surface px-3 py-2.5" />
      </label>
    </ActionForm>
  );
}
