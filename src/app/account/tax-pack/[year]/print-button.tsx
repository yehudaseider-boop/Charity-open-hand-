"use client";

/** Opens the browser's print dialog, where "Save as PDF" makes the tax pack a PDF (also on phones). */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-control bg-brand px-4 py-2 font-semibold text-brand-contrast">
      Save as PDF
    </button>
  );
}
