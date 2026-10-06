"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef } from "react";
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
  resetOnSuccess = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children?: React.ReactNode;
  className?: string;
  /** Ask the person to confirm before sending. */
  confirm?: string;
  /** Clear the form after a successful submit (e.g. uploads). */
  resetOnSuccess?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);

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
          if (confirm && !window.confirm(confirm)) return;
          const formData = new FormData(e.currentTarget);
          startTransition(() => dispatch(formData));
        }}
      >
        {children}
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={pending}
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

export function useFieldError(name: string): string | undefined {
  return useContext(FormStateContext).fieldErrors?.[name];
}
