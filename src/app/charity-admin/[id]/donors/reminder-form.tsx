"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { initialFormState, type FormState } from "@/lib/form";
import { WEEKLY_LIMIT } from "@/lib/charity/weekly-limit-rule";

/** The form's id: each donor's tick box on the list belongs to it through the `form` attribute. */
export const REMINDER_FORM = "s18a-reminders";

type Action = (s: FormState, f: FormData) => Promise<FormState>;

const boxes = () => [...document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form="${REMINDER_FORM}"][name=donor]`)];

/** One donor's tick box on the "Details missing" list. */
export function ReminderTick({ donorId, name }: { donorId: string; name: string }) {
  return (
    <label className="relative z-10 inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-navy">
      <input type="checkbox" name="donor" value={donorId} form={REMINDER_FORM} className="size-5 accent-brand" aria-label={`Choose ${name} for a reminder`} />
      Choose
    </label>
  );
}

/**
 * "Remind to add their details": the chosen donors (tick boxes on the list, or everyone on the filtered list), asked
 * first on the page because an email can't be called back. Nothing chosen is lost if the send is refused or the
 * connection drops.
 */
export function ReminderForm({ action, allIds, charityName, max }: { action: Action; allIds: string[]; charityName: string; max: number }) {
  const safeAction = async (prev: FormState, formData: FormData): Promise<FormState> => {
    try {
      return await action(prev, formData);
    } catch (e) {
      const digest = (e as { digest?: unknown } | null)?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_")) throw e;
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      return {
        ok: false,
        message: offline
          ? "You're offline, so no reminders were sent. Your choice is still ticked. Check your connection and try again."
          : "We couldn't reach Givezy, so we can't tell whether the reminders went. Anyone who got one won't get it twice, so you can safely try again in a moment.",
      };
    }
  };
  const [state, dispatch, pending] = useActionState(safeAction, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);
  const [everyone, setEveryone] = useState(false);
  const [ticked, setTicked] = useState(0);
  const [asking, setAsking] = useState(false);
  const chosen = everyone ? allIds.length : ticked;

  useEffect(() => {
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (!t || t.getAttribute("form") !== REMINDER_FORM || t.name !== "donor") return;
      // Unticking one donor ends "everyone on the list": what is ticked here is the choice again.
      if (!t.checked) setEveryone(false);
      setTicked(boxes().filter((b) => b.checked).length);
      setAsking(false);
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, []);

  const chooseEveryone = (on: boolean) => {
    setEveryone(on);
    for (const b of boxes()) b.checked = on;
    setTicked(on ? boxes().length : 0);
    setAsking(false);
  };

  const send = () => {
    const f = new FormData();
    const ids = everyone ? allIds : boxes().filter((b) => b.checked).map((b) => b.value);
    for (const id of ids) f.append("donor", id);
    setAsking(false);
    startTransition(() => dispatch(f));
  };

  const count = (n: number) => n.toLocaleString("en-ZA").replace(/[,\u00a0\u202f]/g, " ");
  const people = (n: number) => `${count(n)} ${n === 1 ? "donor" : "donors"}`;
  // Over the limit, "everyone on this list" would only be refused, so it isn't offered.
  const tooMany = allIds.length > max;

  return (
    <form
      id={REMINDER_FORM}
      ref={formRef}
      aria-label="Remind to add their details"
      className="space-y-3 rounded-card border-2 border-border bg-surface p-4 text-sm sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (chosen > 0) setAsking(true);
      }}
    >
      <div className="space-y-1">
        <h2 className="font-display text-lg font-bold text-indigo">Remind to add their details</h2>
        <p className="text-muted">
          Each chosen donor gets one email from <bdi>{charityName}</bdi>, sent by Givezy, saying what is still needed and where to add it. You never see their ID or registration number.
          {WEEKLY_LIMIT} Anyone who had a message from you this week, turned off your emails or has added their details since is skipped.
        </p>
      </div>
      {tooMany ? (
        <p className="rounded-card bg-honey-soft p-3 text-navy">
          You can remind up to {count(max)} donors at a time. Narrow the list with a group, tag or search.
        </p>
      ) : allIds.length > 1 ? (
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-navy">
          <input type="checkbox" checked={everyone} onChange={(e) => chooseEveryone(e.target.checked)} className="size-5 accent-brand" />
          Choose everyone on this list ({people(allIds.length)}, on every page)
        </label>
      ) : null}
      <p role="status" className="text-muted">{chosen ? `${people(chosen)} chosen.` : tooMany ? "Tick the donors to remind." : "Tick the donors to remind, or choose everyone on this list."}</p>

      {asking ? (
        <div role="alertdialog" aria-label="Please confirm" className="space-y-3 rounded-card border-2 border-honey bg-honey-soft p-4">
          <p className="font-medium text-navy">Send reminders to {people(chosen)}? An email can&apos;t be called back once it&apos;s sent.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" autoFocus onClick={send} className="pressable inline-flex min-h-11 items-center rounded-control bg-brand px-4 text-sm font-semibold text-brand-contrast">
              Yes, send {chosen === 1 ? "it" : "them"}
            </button>
            <button type="button" onClick={() => setAsking(false)} className="px-2 py-2.5 font-medium text-brand underline">
              Not yet
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending || chosen === 0}
          hidden={asking}
          className="pressable inline-flex min-h-11 items-center rounded-control bg-brand px-4 text-sm font-semibold text-brand-contrast disabled:opacity-60"
        >
          {pending ? "Sending…" : "Remind to add their details"}
        </button>
        {pending ? <p role="status" className="text-muted">Sending reminders, please wait…</p> : null}
        {state.message && !pending ? (
          <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-success" : "text-danger"}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
