"use client";

import { useFormStatus } from "react-dom";
import { useSafeFormPending, useSafeFormWaiting } from "./safe-form";

/**
 * A submit button for a plain server-action form: while the form is working it says so ("Sending…") and
 * can't be pressed again, so a slow connection never sends twice. ActionForm does this for its own forms; inside a SafeForm it follows that form.
 */
export function PendingButton({ children, pendingLabel, className, name, value }: { children: React.ReactNode; pendingLabel: string; className?: string; name?: string; value?: string }) {
  const { pending: sending } = useFormStatus();
  const safePending = useSafeFormPending();
  const waiting = useSafeFormWaiting();
  const pending = sending || safePending;
  // A form that asks first, before the page's script has loaded: off, with its own label, until it can ask.
  const off = pending || waiting;
  return (
    <button type="submit" name={name} value={value} disabled={off} aria-disabled={off} className={`${className ?? ""} disabled:opacity-60`}>
      {pending ? pendingLabel : children}
    </button>
  );
}
