"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button for a plain server-action form: while the form is working it says so ("Sending…") and
 * can't be pressed again, so a slow connection never sends twice. ActionForm does this for its own forms.
 */
export function PendingButton({ children, pendingLabel, className, name, value }: { children: React.ReactNode; pendingLabel: string; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-disabled={pending} className={`${className ?? ""} disabled:opacity-60`}>
      {pending ? pendingLabel : children}
    </button>
  );
}
