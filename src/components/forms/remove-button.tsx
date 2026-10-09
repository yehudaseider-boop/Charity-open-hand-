"use client";

/** A "Remove" button inside a server-action form: asks first, and says what it removes. */
export function RemoveButton({ what, confirmText }: { what: string; confirmText?: string }) {
  return (
    <button
      aria-label={`Remove ${what}`}
      onClick={(e) => {
        if (!window.confirm(confirmText ?? `Remove ${what}? This can't be undone.`)) e.preventDefault();
      }}
      className="text-xs text-danger underline"
    >
      Remove
    </button>
  );
}
