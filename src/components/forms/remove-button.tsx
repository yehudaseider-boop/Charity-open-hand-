"use client";

/**
 * A "Remove" button inside a server-action form, saying what it removes. `label` for another verb ("End").
 * Asks first, unless `ask` is false: on the charity dashboard a removal can be taken back afterwards instead.
 */
export function RemoveButton({ what, confirmText, label = "Remove", ask = true }: { what: string; confirmText?: string; label?: string; ask?: boolean }) {
  return (
    <button
      aria-label={`${label} ${what}`}
      onClick={(e) => {
        if (ask && !window.confirm(confirmText ?? `Remove ${what}? This can't be undone.`)) e.preventDefault();
      }}
      className={`text-xs underline ${label === "Remove" ? "text-danger" : "text-brand"}`}
    >
      {label}
    </button>
  );
}
