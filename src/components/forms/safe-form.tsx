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
 *
 * The server action stays the form's own `action` (review 21/11/2026): before the page's script has loaded (exactly
 * the slow connection this is for) the form is still an ordinary server-action post, so signing in works and nothing
 * typed (an email, a sign-in code) ever lands in the address bar, history or server logs as a GET would put it. Once
 * the script is running, onSubmit takes over: React then runs only our transition, never the action a second time.
 */
export function SafeForm({ action, className, children }: { action: (formData: FormData) => Promise<void>; className?: string; children: React.ReactNode }) {
  const [pending, startTransition] = useTransition();
  const [trouble, setTrouble] = useState<string | null>(null);
  return (
    <SafeFormPending value={pending}>
      <form
        className={className}
        action={action}
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          // With the button that was pressed, so a named submit button's value goes too, as a plain post would send it.
          const formData = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
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
