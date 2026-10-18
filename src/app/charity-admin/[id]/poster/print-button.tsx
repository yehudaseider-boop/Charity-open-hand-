"use client";

/** Opens the browser's print dialog (choose "Save as PDF" there to keep a copy). */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="pressable rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast">
      Print poster
    </button>
  );
}
