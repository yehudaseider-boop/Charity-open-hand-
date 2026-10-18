"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

/** The Undo button: "Taking it back…" while it works, and only one tap. */
export function UndoButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="min-h-11 rounded-control border border-brand px-4 py-2 font-medium text-brand disabled:opacity-60">
      {pending ? "Taking it back…" : "Undo"}
    </button>
  );
}

/** The panel's box: it takes focus when it appears, so keyboard and screen-reader users land on it. */
export function FocusOnArrive({ className, label, children }: { className: string; label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: false });
  }, []);
  return (
    <section ref={ref} tabIndex={-1} role="status" aria-label={label} className={`${className} outline-none focus-visible:ring-2 focus-visible:ring-brand`}>
      {children}
    </section>
  );
}
