"use client";

import { startTransition, useActionState, useState } from "react";
import { addMonthlyId } from "./monthly/add-id-action";
import { FormStateProvider } from "@/components/forms/action-form";
import { TextField } from "@/components/forms/fields";
import { CONFIRM_TEXT, NUDGE_TEXT } from "@/lib/donations/monthly-id-nudge";
import { initialFormState, type FormState } from "@/lib/form";

/**
 * The nudge inside a monthly donation's card: add an SA ID number so its s18A receipts can be reported to
 * SARS (decided 03/11/2026). It asks first on the page, because the change can't be taken back here, says
 * what it is doing while it saves, keeps what was typed after a refusal, and once saved says what changed.
 */
export function MonthlyIdForm({ id }: { id: string }) {
  const safeAction = async (prev: FormState, formData: FormData): Promise<FormState> => {
    try {
      return await addMonthlyId(prev, formData);
    } catch (e) {
      const digest = (e as { digest?: unknown } | null)?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_")) throw e;
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      return {
        ok: false,
        message: offline
          ? "You're offline, so this wasn't saved. What you typed is still here. Check your connection and try again."
          : "We couldn't reach Givezy, so this may not have been saved. What you typed is still here. Please try again in a moment.",
      };
    }
  };
  const [state, dispatch, pending] = useActionState(safeAction, initialFormState);
  const [asking, setAsking] = useState<FormData | null>(null);

  if (state.ok) {
    return (
      <p role="status" className="mt-3 rounded-control bg-success-soft p-3 text-sm text-success">
        {state.message}
      </p>
    );
  }

  return (
    <FormStateProvider state={state}>
      <form
        className="mt-3 space-y-3 rounded-control bg-honey-soft p-3"
        onSubmit={(e) => {
          e.preventDefault();
          setAsking(new FormData(e.currentTarget));
        }}
      >
        <p className="text-sm text-navy">{NUDGE_TEXT}</p>
        <input type="hidden" name="id" value={id} />
        <TextField name="id_number" label="SA ID number" required inputMode="numeric" autoComplete="off" maxLength={20} hint="13 digits, as on your ID." />
        {asking ? (
          <div role="alertdialog" aria-label="Please confirm" className="space-y-3 rounded-control border-2 border-honey bg-surface p-3 text-sm">
            <p className="font-medium text-navy">{CONFIRM_TEXT}</p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                autoFocus
                onClick={() => {
                  const held = asking;
                  setAsking(null);
                  startTransition(() => dispatch(held));
                }}
                className="pressable inline-flex min-h-11 items-center rounded-control bg-brand px-4 text-sm font-semibold text-brand-contrast"
              >
                Yes, save my ID number
              </button>
              <button type="button" onClick={() => setAsking(null)} className="px-2 py-2.5 font-medium text-brand underline">
                Not yet
              </button>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={pending}
            hidden={Boolean(asking)}
            className="pressable inline-flex min-h-11 items-center rounded-control bg-brand px-4 text-sm font-semibold text-brand-contrast disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {pending ? <p role="status" className="text-sm text-muted">Saving, please wait…</p> : null}
          {state.message && !pending ? <p role="alert" className="text-sm text-danger">{state.message}</p> : null}
        </div>
      </form>
    </FormStateProvider>
  );
}
