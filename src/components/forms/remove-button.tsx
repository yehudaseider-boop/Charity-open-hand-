"use client";

import { useFormStatus } from "react-dom";

/**
 * A "Remove" button inside a server-action form, saying what it removes. `label` for another verb ("End").
 * Asks first, unless `ask` is false: on the charity dashboard a removal can be taken back afterwards instead.
 * Shows "Removing…" while it works, and is big enough to tap.
 */
export function RemoveButton({ what, confirmText, label = "Remove", ask = true }: { what: string; confirmText?: string; label?: string; ask?: boolean }) {
  const { pending } = useFormStatus();
  const working = label === "Remove" ? "Removing…" : label === "End" ? "Ending…" : "Working…";
  return (
    <button
      aria-label={`${label} ${what}`}
      disabled={pending}
      onClick={(e) => {
        if (ask && !window.confirm(confirmText ?? `Remove ${what}? This can't be undone.`)) e.preventDefault();
      }}
      className={`-my-2 inline-flex min-h-11 items-center px-2 text-sm underline disabled:no-underline disabled:opacity-60 ${label === "Remove" ? "text-danger" : "text-brand"}`}
    >
      {pending ? working : label}
    </button>
  );
}
