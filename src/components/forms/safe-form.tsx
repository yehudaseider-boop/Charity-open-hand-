"use client";

import { createContext, useContext, useState, useSyncExternalStore, useTransition } from "react";
import { connectionTroubleMessage } from "./action-form";

const noSubscription = () => () => {};
const SafeFormPending = createContext(false);
const SafeFormWaiting = createContext(false);

/** True while the SafeForm around it is sending (PendingButton reads it). */
export function useSafeFormPending(): boolean {
  return useContext(SafeFormPending);
}

/**
 * True while a SafeForm that asks first (confirmText) is waiting for the page's script: its button stays off until
 * the question can be asked (PendingButton reads it), without saying it is working.
 */
export function useSafeFormWaiting(): boolean {
  return useContext(SafeFormWaiting);
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
 *
 * A form that asks first (confirmText: cancel, pause or remove a monthly donation) can't ask before the script has
 * loaded, and a post then would skip the question (review 21/11/2026). So until the page is running it has no
 * server action and its button is off: a tap before then does nothing, and the question is asked once it can be.
 */
export function SafeForm({
  action,
  className,
  confirmText,
  children,
  nothingTyped,
}: {
  action: (formData: FormData) => Promise<void>;
  className?: string;
  /** Ask first (for a step that can't be taken back), as the form did before with its own confirm. */
  confirmText?: string;
  children: React.ReactNode;
  /** A button with nothing to type (Undo, Remove, Stop emails): the message doesn't mention typing. */
  nothingTyped?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [trouble, setTrouble] = useState<string | null>(null);
  // False in the server's markup and while the page hydrates; true once the page's script has taken over the form
  // (the codebase's way of knowing it is running, as in the landing page's doors: no setState in an effect).
  const running = useSyncExternalStore(noSubscription, () => true, () => false);
  const waiting = Boolean(confirmText) && !running;
  return (
    <SafeFormPending value={pending}>
      <SafeFormWaiting value={waiting}>
        <form
          className={className}
          action={confirmText ? (running ? action : undefined) : action}
          onSubmit={(e) => {
            e.preventDefault();
            if (pending || waiting) return;
            if (confirmText && !window.confirm(confirmText)) return;
            // With the button that was pressed, so a named submit button's value goes too, as a plain post would send it.
            const formData = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
            setTrouble(null);
            startTransition(async () => {
              try {
                await action(formData);
              } catch (err) {
                setTrouble(connectionTroubleMessage(err, { nothingTyped }));
              }
            });
          }}
        >
          {children}
          {trouble && !pending ? <p role="alert" className="text-sm font-semibold text-danger">{trouble}</p> : null}
        </form>
      </SafeFormWaiting>
    </SafeFormPending>
  );
}
