"use client";

import { changeMonthly } from "./monthly/actions";

/** Pause, resume, cancel or remove a monthly donation. Cancelling asks first: it cannot be undone. */
export function MonthlyButton({ id, status, label, danger, confirmText }: { id: string; status: string; label: string; danger?: boolean; confirmText?: string }) {
  return (
    <form
      action={changeMonthly}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className={`min-h-11 text-sm underline ${danger ? "text-danger" : "text-brand"}`}>{label}</button>
    </form>
  );
}
