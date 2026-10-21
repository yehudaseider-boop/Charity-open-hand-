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
  pendingLabel = "Saving…",
  children,
  className = "",
  confirm,
  confirmLabel,
  resetOnSuccess = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  /** What the button says while it works: "Sending…", "Uploading…". */
  pendingLabel?: string;
  children?: React.ReactNode;
  className?: string;
  /** Ask the person to confirm before sending, on the page (for actions that can't be taken back). */
  confirm?: string;
  /** The confirming button's words; default "Yes, " and the submit label. */
  confirmLabel?: string;
  /** Clear the form after a successful submit (e.g. uploads). */
  resetOnSuccess?: boolean;
}) {
  // A dropped connection or a server error stays on this form, with everything typed kept: it never
  // throws the whole page away. Next's own redirects (after a save) still go through.
  const safeAction = async (prev: FormState, formData: FormData): Promise<FormState> => {
    try {
      return await action(prev, formData);
    } catch (e) {
      const digest = (e as { digest?: unknown } | null)?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_")) throw e;
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      return {
        ok: false,
        message: offline
          ? "You're offline, so this wasn't sent. What you typed is still here. Check your connection and try again."
          : "We couldn't reach Givezy, so this may not have gone through. What you typed is still here. Please try again in a moment.",
      };
    }
  };
  const [state, dispatch, pending] = useActionState(safeAction, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);
  // The filled-in form, held while the person confirms.
  const [asking, setAsking] = useState<FormData | null>(null);

  useEffect(() => {
    if (resetOnSuccess && state.ok) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  // After a refusal, take the person to the first thing to fix (on a long form it may be far above).
  useEffect(() => {
    if (!state.fieldErrors) return;
    const first = formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]");
    first?.focus();
    first?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [state]);

  return (
    <FormStateContext value={state}>
      <form
        ref={formRef}
        // Our own plain-words checks run (on the server, shown by each field). Forms that ask first keep
        // the browser's quick checks, so nothing is confirmed that would then be refused.
        noValidate={!confirm}
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
                  // What is in the form now, in case something was edited while the question was open.
                  const held = formRef.current ? new FormData(formRef.current) : asking;
                  setAsking(null);
                  startTransition(() => dispatch(held));
                }}
                className="pressable rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast"
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
            className="pressable rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast disabled:opacity-60"
          >
            {pending ? pendingLabel : submitLabel}
          </button>
          {pending ? (
            <p role="status" className="text-sm text-muted">{pendingLabel.replace(/…$/, "")}, please wait…</p>
          ) : null}
          {state.message && !pending ? (
            <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>
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
