"use client";

import { startTransition, useActionState } from "react";
import { joinLaunchList } from "@/app/launch-list/actions";
import { initialFormState, type FormState } from "@/lib/form";
import { LAUNCH_LIST_CONSENT } from "@/lib/launch-list";

/**
 * "Notify me at launch" (10/11/2026). Shown only while the list is open (appLinks.launchListOpen). What was typed
 * stays when something goes wrong; the answer is read out to screen readers.
 */
export function NotifyForm() {
  const safe = async (prev: FormState, data: FormData): Promise<FormState> => {
    try {
      return await joinLaunchList(prev, data);
    } catch {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      return { ok: false, message: offline ? "You're offline, so nothing was saved. Check your connection and try again." : "We couldn't reach Givezy, so nothing was saved. Please try again in a moment." };
    }
  };
  const [state, dispatch, pending] = useActionState(safe, initialFormState);
  const error = state.fieldErrors?.email;

  if (state.ok) {
    return (
      <p role="status" className="flex items-center gap-3 rounded-[1.25rem] bg-success-soft px-5 py-4 text-[16px] font-semibold text-success">
        <svg aria-hidden viewBox="0 0 24 24" width="22" height="22" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 stroke-success"><path d="M5 12l5 5L20 7" /></svg>
        {state.message}
      </p>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => dispatch(data));
      }}
      className="flex flex-col gap-3"
    >
      <label htmlFor="launch-email" className="text-[15px] font-semibold">Your email address</label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="launch-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby="launch-consent launch-answer"
          className="min-h-14 min-w-0 flex-1 rounded-[1.125rem] border-2 border-border bg-white px-4 text-[17px] text-navy outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft aria-[invalid=true]:border-danger"
        />
        {/* A hidden field people never see: a bot that fills it is told "done" and nothing is saved. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
        <button type="submit" disabled={pending} className="pressable inline-flex min-h-14 items-center justify-center rounded-[1.125rem] bg-coral px-7 text-[17px] font-bold text-navy disabled:opacity-70">
          {pending ? "Adding you…" : "Notify me at launch"}
        </button>
      </div>
      <p id="launch-answer" role="alert" className={`text-[15px] font-medium text-danger ${state.message ? "" : "sr-only"}`}>{state.message ?? ""}</p>
      <p id="launch-consent" className="text-[14px] leading-relaxed text-muted">{LAUNCH_LIST_CONSENT.text}</p>
    </form>
  );
}
