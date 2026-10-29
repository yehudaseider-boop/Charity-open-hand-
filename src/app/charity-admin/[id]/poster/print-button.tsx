"use client";

import { blueAction, primaryAction } from "@/components/dash";

/**
 * Opens the browser's print dialog (choose "Save as PDF" there to keep a copy). `primary` makes it the
 * page's one orange action (the poster page); elsewhere it stays blue.
 */
export function PrintButton({ label = "Print poster", primary = false }: { label?: string; primary?: boolean }) {
  return (
    <button type="button" onClick={() => window.print()} className={primary ? primaryAction : blueAction}>
      {label}
    </button>
  );
}
