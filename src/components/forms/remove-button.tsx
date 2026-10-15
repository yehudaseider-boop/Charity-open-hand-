"use client";

/** A "Remove" button inside a server-action form: asks first, and says what it removes. `label` for another verb ("End"). */
export function RemoveButton({ what, confirmText, label = "Remove" }: { what: string; confirmText?: string; label?: string }) {
  return (
    <button
      aria-label={`${label} ${what}`}
      onClick={(e) => {
        if (!window.confirm(confirmText ?? `Remove ${what}? This can't be undone.`)) e.preventDefault();
      }}
      className={`text-xs underline ${label === "Remove" ? "text-danger" : "text-brand"}`}
    >
      {label}
    </button>
  );
}
