"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { connectionTroubleMessage } from "./action-form";

const SafeFormPending = createContext(false);

/** True while the SafeForm around it is sending (PendingButton reads it). */
export function useSafeFormPending(): boolean {
  return useContext(SafeFormPending);
}

/**
 * A plain server-action form (one that answers with a redirect) that survives a dropped connection (21/11/2026).
 * `<form action={…}>` on its own throws a failed send to the page's error screen: the person lost what they typed and
 * read "this page couldn't open" about a page that had opened. Here the form stays as it was, says plainly what
 * happened, and Send can be pressed again. The browser's own checks (required, email) still run first.
 */
export function SafeForm({ action, className, children }: { action: (formData: FormData) => Promise<void>; className?: string; children: React.ReactNode }) {
  const [pending, startTransition] = useTransition();
  const [trouble, setTrouble] = useState<string | null>(null);
  return (
    <SafeFormPending value={pending}>
      <form
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          const formData = new FormData(e.currentTarget);
          setTrouble(null);
          startTransition(async () => {
            try {
              await action(formData);
            } catch (err) {
              setTrouble(connectionTroubleMessage(err));
            }
          });
        }}
      >
        {children}
        {trouble && !pending ? <p role="alert" className="text-sm font-semibold text-danger">{trouble}</p> : null}
      </form>
    </SafeFormPending>
  );
}
