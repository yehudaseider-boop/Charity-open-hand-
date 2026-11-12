"use client";

import { startTransition, useActionState, useId, useMemo, useState } from "react";
import {
  BODY_MAX,
  JOURNEY_MAX_STEPS,
  STARTER_STEPS,
  SUBJECT_MAX,
  canRemoveStep,
  charityPageUrl,
  middleStepWords,
  stepsShifted,
  cleanSubject,
  journeyEmail,
  waitRange,
  type JourneyStep,
} from "@/lib/charity/journey";
import { cleanThankYouNote, hasWebAddress } from "@/lib/charity/thank-you-note";
import { textEmailHtml } from "@/lib/email/html";
import { initialFormState, type FormState } from "@/lib/form";

/** `from`: the email's place when the page was opened (0-based), or null for one added since. */
type Draft = { key: number; subject: string; body: string; wait: string; from: number | null };
const toDraft = (s: JourneyStep, key: number, from: number | null): Draft => ({ key, subject: s.subject, body: s.body, wait: String(s.waitDays), from });
/** A fresh key for a new or reset email (only in event handlers, never while drawing). */
const freshKey = () => Date.now() + Math.random();

/** "Day 2", "Day 23": when each email goes, counted from the day a donor joins (if every week is free). */
function dayLabels(drafts: Draft[]): (number | null)[] {
  let total = 0;
  return drafts.map((d) => {
    const n = /^\d{1,3}$/.test(d.wait.trim()) ? Number(d.wait) : NaN;
    if (!Number.isFinite(n) || total < 0) {
      total = -1;
      return null;
    }
    total += n;
    return total;
  });
}

/**
 * The donor journey's emails: up to five, each with a wait, a subject and the charity's words, and the email shown as
 * the donor gets it (the same code writes the real one). Plain words only; Givezy adds the button and the stop link.
 * Everything typed is kept if saving is refused or the connection drops.
 */
export function JourneyEditor({
  action,
  charityName,
  slug,
  saved,
  canEdit,
  siteUrl,
  starter = STARTER_STEPS,
  onIt = 0,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  charityName: string;
  slug: string;
  saved: JourneyStep[];
  canEdit: boolean;
  siteUrl?: string;
  /** The suggested wording for this kind of journey (DRAFT for Yosef). */
  starter?: JourneyStep[];
  /** People part way through the journey: while there are any, only the last email can be removed. */
  onIt?: number;
}) {
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
          ? "You're offline, so this wasn't saved. What you typed is still here. Check your connection and try again."
          : "We couldn't reach Givezy, so this may not have saved. What you typed is still here. Please try again in a moment.",
      };
    }
  };
  const [state, dispatch, pending] = useActionState(safeAction, initialFormState);
  const [drafts, setDrafts] = useState<Draft[]>(() => saved.map((s, i) => toDraft(s, i, i)));
  const [showing, setShowing] = useState(0);
  const id = useId();

  const dirty = JSON.stringify(drafts.map((d) => [cleanSubject(d.subject), cleanThankYouNote(d.body) ?? "", d.wait.trim()])) !== JSON.stringify(saved.map((s) => [s.subject, s.body, String(s.waitDays)]));
  const days = dayLabels(drafts);
  const current = drafts[Math.min(showing, drafts.length - 1)] ?? null;
  const site = siteUrl ?? "https://givezy.co.za";

  const email = useMemo(
    () =>
      current
        ? journeyEmail("donor@example.com", {
            charityName,
            firstName: "Thandi",
            subject: cleanSubject(current.subject) || "(no subject yet)",
            body: current.body || "(Your words go here.)",
            pageUrl: charityPageUrl(site, slug),
            stopUrl: `${site}/news/stop`,
            replyTo: null,
          })
        : null,
    [current, charityName, site, slug],
  );
  const html = useMemo(() => (email ? textEmailHtml({ subject: email.subject, text: email.text, siteUrl, quoted: email.quoted }) : ""), [email, siteUrl]);

  const change = (i: number, patch: Partial<Draft>) => setDrafts((all) => all.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const add = () => {
    setDrafts((all) => [...all, { key: freshKey(), subject: "", body: "", wait: all.length ? "30" : "2", from: null }]);
    setShowing(drafts.length);
  };
  const remove = (i: number) => {
    // Never a middle email while people are part way through (the button isn't offered then; this is the backstop).
    if (!canRemoveStep(i, drafts.length, onIt)) return;
    setDrafts((all) => all.filter((_, j) => j !== i));
    setShowing((s) => Math.max(0, Math.min(s, drafts.length - 2)));
  };
  const err = (field: string) => state.fieldErrors?.[field];

  if (!canEdit) {
    return saved.length ? (
      <ol className="space-y-3 text-sm">
        {saved.map((s, i) => (
          <li key={i} className="space-y-1 rounded-card border-2 border-border p-3">
            <p className="font-semibold text-navy">
              Email {i + 1} <span className="font-normal text-muted">· {i === 0 ? `${s.waitDays} days after they join` : `${s.waitDays} days after email ${i}`}</span>
            </p>
            <p dir="auto" className="font-semibold [overflow-wrap:anywhere]">{s.subject}</p>
            <p dir="auto" className="whitespace-pre-line text-muted [overflow-wrap:anywhere]">{s.body}</p>
          </li>
        ))}
      </ol>
    ) : (
      <p className="rounded-control border-2 border-dashed border-honey bg-honey-soft/60 p-4 text-sm text-muted">No emails have been written for this journey yet.</p>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form
        className="min-w-0 space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(() => dispatch(new FormData(e.currentTarget)));
        }}
      >
        <input type="hidden" name="steps" value={drafts.length} />
        {/* Tells the server a saved email would move to another number, so it can refuse while people are part way. */}
        <input type="hidden" name="shifted" value={stepsShifted(drafts.map((d) => d.from)) ? "yes" : ""} />
        {drafts.length === 0 ? (
          <div className="space-y-3 rounded-control border-2 border-dashed border-honey bg-honey-soft/60 p-4 text-sm">
            <p className="font-semibold text-navy">No emails yet.</p>
            <p className="text-muted">Start from our suggested wording and make it your own, or write your first email from scratch.</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setDrafts(starter.map((s, i) => toDraft(s, freshKey(), i < saved.length ? i : null)));
                  setShowing(0);
                }}
                className="pressable inline-flex min-h-11 items-center rounded-control bg-brand px-4 text-sm font-semibold text-brand-contrast"
              >
                Start from our suggested wording
              </button>
              <button type="button" onClick={add} className="inline-flex min-h-11 items-center rounded-control border-2 border-border px-4 text-sm font-semibold text-brand">
                Write my own
              </button>
            </div>
          </div>
        ) : null}

        {drafts.map((d, i) => {
          const range = waitRange(i + 1);
          const subjectLen = cleanSubject(d.subject).length;
          const bodyLen = (cleanThankYouNote(d.body) ?? "").length;
          const link = hasWebAddress(d.body) || hasWebAddress(d.subject);
          return (
            <fieldset key={d.key} className="min-w-0 space-y-3 rounded-card border-2 border-border p-4" onFocus={() => setShowing(i)}>
              <legend className="px-1 font-display text-base font-bold text-indigo">
                Email {i + 1}
                {days[i] !== null ? <span className="ml-2 font-sans text-sm font-normal text-muted">around day {days[i]}</span> : null}
              </legend>
              <div className="space-y-1">
                <label htmlFor={`${id}-wait-${i}`} className="block text-sm font-semibold">
                  {i === 0 ? "Days after they join" : `Days after email ${i}`}
                </label>
                <input
                  id={`${id}-wait-${i}`}
                  name={`wait_${i + 1}`}
                  inputMode="numeric"
                  value={d.wait}
                  onChange={(e) => change(i, { wait: e.target.value.replace(/[^\d]/g, "").slice(0, 3) })}
                  aria-invalid={err(`wait_${i + 1}`) ? true : undefined}
                  aria-describedby={`${id}-wait-${i}-hint`}
                  className="w-28 rounded-[0.875rem] border-2 border-border bg-surface px-3.5 py-2.5 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand-soft aria-invalid:border-danger"
                />
                <p id={`${id}-wait-${i}-hint`} className={`text-xs ${err(`wait_${i + 1}`) ? "font-semibold text-danger" : "text-muted"}`}>
                  {err(`wait_${i + 1}`) ?? `${range.min} to ${range.max} days.`}
                </p>
              </div>
              <div className="space-y-1">
                <label htmlFor={`${id}-subject-${i}`} className="block text-sm font-semibold">Subject</label>
                <input
                  id={`${id}-subject-${i}`}
                  name={`subject_${i + 1}`}
                  dir="auto"
                  value={d.subject}
                  onChange={(e) => change(i, { subject: e.target.value })}
                  aria-invalid={err(`subject_${i + 1}`) || subjectLen > SUBJECT_MAX ? true : undefined}
                  className="w-full rounded-[0.875rem] border-2 border-border bg-surface px-3.5 py-2.5 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand-soft aria-invalid:border-danger"
                />
                {err(`subject_${i + 1}`) ? <p role="alert" className="text-sm font-semibold text-danger">{err(`subject_${i + 1}`)}</p> : null}
              </div>
              <div className="space-y-1">
                <label htmlFor={`${id}-body-${i}`} className="block text-sm font-semibold">Your words</label>
                <textarea
                  id={`${id}-body-${i}`}
                  name={`body_${i + 1}`}
                  rows={6}
                  dir="auto"
                  value={d.body}
                  onChange={(e) => change(i, { body: e.target.value })}
                  aria-invalid={err(`body_${i + 1}`) || bodyLen > BODY_MAX || link ? true : undefined}
                  className="w-full rounded-[0.875rem] border-2 border-border bg-surface px-3.5 py-2.5 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand-soft aria-invalid:border-danger"
                />
                <p className={`text-xs tabular-nums ${bodyLen > BODY_MAX ? "font-semibold text-danger" : "text-muted"}`}>
                  {bodyLen} of {BODY_MAX} characters{bodyLen > BODY_MAX ? `: ${bodyLen - BODY_MAX} too many` : ""}
                </p>
                {link ? <p className="text-sm font-semibold text-danger">Leave out web addresses: we add a button to your page on Givezy ourselves.</p> : null}
                {err(`body_${i + 1}`) ? <p role="alert" className="text-sm font-semibold text-danger">{err(`body_${i + 1}`)}</p> : null}
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => setShowing(i)} className="px-1 py-2 text-sm font-medium text-brand underline">
                  Preview this email
                </button>
                {canRemoveStep(i, drafts.length, onIt) ? (
                  <button type="button" onClick={() => remove(i)} className="px-1 py-2 text-sm font-medium text-danger underline">
                    Remove email {i + 1}
                  </button>
                ) : null}
              </div>
              {canRemoveStep(i, drafts.length, onIt) ? null : <p className="text-xs text-muted">{middleStepWords(onIt)}</p>}
            </fieldset>
          );
        })}

        {drafts.length > 0 && drafts.length < JOURNEY_MAX_STEPS ? (
          <button type="button" onClick={add} className="inline-flex min-h-11 items-center rounded-control border-2 border-border px-4 text-sm font-semibold text-brand">
            Add email {drafts.length + 1}
          </button>
        ) : drafts.length >= JOURNEY_MAX_STEPS ? (
          <p className="text-sm text-muted">{JOURNEY_MAX_STEPS} emails is the most a journey has.</p>
        ) : null}

        {drafts.length > 0 || saved.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={pending || !dirty || drafts.length === 0} className="pressable inline-flex min-h-11 items-center rounded-control bg-brand px-4 text-sm font-semibold text-brand-contrast disabled:opacity-60">
              {pending ? "Saving…" : "Save emails"}
            </button>
            {dirty && saved.length ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setDrafts(saved.map((s, i) => toDraft(s, freshKey(), i)));
                  setShowing(0);
                }}
                className="px-1 py-2.5 text-sm font-medium text-brand underline"
              >
                Put back what&apos;s saved
              </button>
            ) : null}
          </div>
        ) : null}
        <p role={state.message && !state.ok && !pending ? "alert" : "status"} className={`text-sm ${state.message && !state.ok && !pending ? "text-danger" : "text-muted"}`}>
          {pending
            ? "Saving, please wait…"
            : state.message && (!state.ok || !dirty)
              ? state.message
              : dirty
                ? drafts.length === 0
                  ? "A journey needs at least one email. To stop sending, switch the journey off instead."
                  : "Not saved yet. Donors get the saved emails until you press Save."
                : saved.length
                  ? "Saved."
                  : ""}
        </p>
      </form>

      <section aria-label="Preview of a journey email" className="min-w-0 space-y-2">
        <p className="text-sm font-semibold">{current ? `What the donor gets: email ${Math.min(showing, drafts.length - 1) + 1}` : "What the donor gets"}</p>
        {email ? (
          <>
            <p className="text-xs text-muted">
              A sample for a made-up donor called Thandi. Each donor sees their own first name. Givezy adds the button to your page and the
              line that lets them stop your emails.{dirty ? " This shows what you have typed, not yet saved." : ""}
            </p>
            <p className="text-sm [overflow-wrap:anywhere]">
              <span className="text-muted">Subject: </span>
              <span dir="auto">{email.subject}</span>
            </p>
            {/* The real email's HTML, shut in a frame that can run nothing and open nothing. */}
            <iframe title="Preview of a journey email" sandbox="" srcDoc={html} className="h-[34rem] w-full rounded-control border-2 border-border bg-white" />
          </>
        ) : (
          <p className="rounded-control border-2 border-dashed border-honey bg-honey-soft/60 p-4 text-sm text-muted">Add an email to see it here as a donor will.</p>
        )}
      </section>
    </div>
  );
}
