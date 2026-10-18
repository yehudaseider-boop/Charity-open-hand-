"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState } from "react";
import { initialFormState, type FormState } from "@/lib/form";

const FormStateContext = createContext<FormState>(initialFormState);

/**
 * A form wired to a server action, showing its result and field errors.
 *
 * The action is dispatched manually rather than through <form action>,
 * because React clears a form after an action runs: someone who made one
 * mistake would lose everything they typed.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
  className = "",
  confirm,
  confirmLabel,
  resetOnSuccess = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children?: React.ReactNode;
  className?: string;
  /** Ask the person to confirm before sending, on the page (for actions that can't be taken back). */
  confirm?: string;
  /** The confirming button's words; default "Yes, " and the submit label. */
  confirmLabel?: string;
  /** Clear the form after a successful submit (e.g. uploads). */
  resetOnSuccess?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);
  // The filled-in form, held while the person confirms.
  const [asking, setAsking] = useState<FormData | null>(null);

  useEffect(() => {
    if (resetOnSuccess && state.ok) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <FormStateContext value={state}>
      <form
        ref={formRef}
        className={`space-y-3 ${className}`}
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          if (confirm) {
            setAsking(formData);
            return;
          }
          startTransition(() => dispatch(formData));
        }}
      >
        {children}
        {asking ? (
          <div role="alertdialog" aria-label="Please confirm" className="space-y-3 rounded-card border border-border bg-honey-soft p-4 text-sm">
            <p className="font-medium text-navy">{confirm}</p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                autoFocus
                onClick={() => {
                  const held = asking;
                  setAsking(null);
                  startTransition(() => dispatch(held));
                }}
                className="rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast"
              >
                {confirmLabel ?? `Yes, ${submitLabel.charAt(0).toLowerCase()}${submitLabel.slice(1)}`}
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
            className="rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast disabled:opacity-60"
          >
            {pending ? "Saving…" : submitLabel}
          </button>
          {state.message && !pending ? (
            <p role="status" className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>
              {state.message}
            </p>
          ) : null}
        </div>
      </form>
    </FormStateContext>
  );
}

/** For forms that manage their own action state but reuse the field components. */
export function FormStateProvider({ state, children }: { state: FormState; children: React.ReactNode }) {
  return <FormStateContext value={state}>{children}</FormStateContext>;
}

export function useFieldError(name: string): string | undefined {
  return useContext(FormStateContext).fieldErrors?.[name];
}
