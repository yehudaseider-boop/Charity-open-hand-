"use client";

import { startTransition, useActionState, useId, useMemo, useState } from "react";
import {
  BODY_MAX,
  JOURNEY_MAX_STEPS,
  STARTER_STEPS,
  SUBJECT_MAX,
  canRemoveStep,
  charityPageUrl,
  charityPictureUrl,
  PICTURE_ALT_MAX,
  exampleFor,
  stepHints,
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
import type { PictureUpload } from "./actions";

/** `from`: the email's place when the page was opened (0-based), or null for one added since. */
type Draft = {
  key: number;
  subject: string;
  body: string;
  wait: string;
  from: number | null;
  before?: { subject: string; body: string };
  /** The email's picture (23/11/2026): its file, where it is shown from, and its description. */
  imagePath: string;
  imageUrl: string;
  imageAlt: string;
};
const toDraft = (s: JourneyStep, key: number, from: number | null): Draft => ({
  key,
  subject: s.subject,
  body: s.body,
  wait: String(s.waitDays),
  from,
  imagePath: s.imagePath ?? "",
  imageUrl: s.imagePath ? charityPictureUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, s.imagePath) : "",
  imageAlt: s.imageAlt ?? "",
});
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
  start = "A donor gives for the first time",
  onIt = 0,
  uploadPicture,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  charityName: string;
  slug: string;
  saved: JourneyStep[];
  canEdit: boolean;
  siteUrl?: string;
  /** Our example wording for this kind of journey, one email at a time (DRAFT for Yosef). */
  starter?: JourneyStep[];
  /** Where this journey starts, in the charity's words: "A donor gives for the first time". */
  start?: string;
  /** Puts a picture in the charity's folder and says where it is (none: pictures can't be added here). */
  uploadPicture?: (formData: FormData) => Promise<PictureUpload>;
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

  const dirty =
    JSON.stringify(drafts.map((d) => [cleanSubject(d.subject), cleanThankYouNote(d.body) ?? "", d.wait.trim(), d.imagePath, d.imagePath ? d.imageAlt.trim() : ""])) !==
    JSON.stringify(saved.map((s) => [s.subject, s.body, String(s.waitDays), s.imagePath ?? "", s.imageAlt ?? ""]));
  // Which email's picture is uploading, and what went wrong with one (by the email's key).
  const [uploading, setUploading] = useState<number | null>(null);
  const [pictureError, setPictureError] = useState<{ key: number; message: string } | null>(null);
  const addPicture = async (i: number, d: Draft, file: File | undefined) => {
    if (!file || !uploadPicture) return;
    setPictureError(null);
    setUploading(d.key);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const r = await uploadPicture(fd);
      if (r.ok) change(i, { imagePath: r.path, imageUrl: r.url });
      else setPictureError({ key: d.key, message: r.message });
    } catch {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      setPictureError({ key: d.key, message: offline ? "You're offline, so the picture didn't upload. Check your connection and try again." : "We couldn't reach Givezy, so the picture didn't upload. Please try again." });
    } finally {
      setUploading(null);
    }
  };
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
            picture: current.imageUrl ? { url: current.imageUrl, alt: current.imageAlt.trim() || "A picture from the charity" } : null,
          })
        : null,
    [current, charityName, site, slug],
  );
  const html = useMemo(() => (email ? textEmailHtml({ subject: email.subject, text: email.text, siteUrl, quoted: email.quoted, picture: email.picture }) : ""), [email, siteUrl]);

  const change = (i: number, patch: Partial<Draft>) => setDrafts((all) => all.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const add = () => {
    setDrafts((all) => [...all, { key: freshKey(), subject: "", body: "", wait: all.length ? "30" : "2", from: null, imagePath: "", imageUrl: "", imageAlt: "" }]);
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

  const field =
    "w-full rounded-[0.875rem] border-2 border-border bg-surface px-3.5 py-2.5 outline-none transition placeholder:text-muted/80 focus:border-brand focus:ring-4 focus:ring-brand-soft aria-invalid:border-danger";
  const canAdd = drafts.length < JOURNEY_MAX_STEPS;

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

        {/* The journey, step by step (23/11/2026): it starts when a donor gives, then each step is a wait and an email. */}
        <ol aria-label="Your journey, step by step" className="relative space-y-3 border-l-2 border-honey pl-5">
          <li className="relative">
            <span aria-hidden="true" className="absolute -left-[1.95rem] top-2.5 size-4 rounded-full border-2 border-surface bg-brand" />
            <p className="inline-flex min-h-11 items-center rounded-full bg-brand px-4 text-sm font-semibold text-brand-contrast [overflow-wrap:anywhere]">{start}</p>
          </li>

          {drafts.map((d, i) => {
            const range = waitRange(i + 1);
            const subjectLen = cleanSubject(d.subject).length;
            const bodyLen = (cleanThankYouNote(d.body) ?? "").length;
            const link = hasWebAddress(d.body) || hasWebAddress(d.subject);
            const hint = stepHints(i);
            const example = exampleFor(starter, i);
            return (
              <li key={d.key} className="relative space-y-3">
                {/* The wait before this email. */}
                <div className="relative space-y-1">
                  <span aria-hidden="true" className="absolute -left-[1.85rem] top-3 size-3 rounded-full border-2 border-honey bg-surface" />
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <label htmlFor={`${id}-wait-${i}`} className="font-semibold">
                      {i === 0 ? "Then wait" : `After email ${i}, wait`}
                    </label>
                    <input
                      id={`${id}-wait-${i}`}
                      name={`wait_${i + 1}`}
                      inputMode="numeric"
                      value={d.wait}
                      placeholder={String(range.min)}
                      onChange={(e) => change(i, { wait: e.target.value.replace(/[^\d]/g, "").slice(0, 3) })}
                      aria-invalid={err(`wait_${i + 1}`) ? true : undefined}
                      aria-describedby={`${id}-wait-${i}-hint`}
                      className="w-20 rounded-[0.875rem] border-2 border-border bg-surface px-3 py-2 text-center tabular-nums outline-none transition focus:border-brand focus:ring-4 focus:ring-brand-soft aria-invalid:border-danger"
                    />
                    <span className="font-semibold">days</span>
                  </div>
                  <p id={`${id}-wait-${i}-hint`} className={`text-xs ${err(`wait_${i + 1}`) ? "font-semibold text-danger" : "text-muted"}`}>
                    {err(`wait_${i + 1}`) ?? `${range.min} to ${range.max} days${i === 0 ? " after they join" : ""}.`}
                  </p>
                </div>

                {/* The email. */}
                <div className="relative">
                <span aria-hidden="true" className="absolute -left-[1.95rem] top-1 size-4 rounded-full border-2 border-surface bg-coral" />
                <fieldset className="min-w-0 space-y-3 rounded-card border-2 border-border bg-surface p-4" onFocus={() => setShowing(i)}>
                  <legend className="px-1 font-display text-base font-bold text-indigo">
                    Send email {i + 1}
                    {days[i] !== null ? <span className="ml-2 font-sans text-sm font-normal text-muted">around day {days[i]}</span> : null}
                  </legend>
                  <div className="space-y-1">
                    <label htmlFor={`${id}-subject-${i}`} className="block text-sm font-semibold">Subject</label>
                    <input
                      id={`${id}-subject-${i}`}
                      name={`subject_${i + 1}`}
                      dir="auto"
                      value={d.subject}
                      placeholder={hint.subject}
                      onChange={(e) => change(i, { subject: e.target.value })}
                      aria-invalid={err(`subject_${i + 1}`) || subjectLen > SUBJECT_MAX ? true : undefined}
                      className={field}
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
                      placeholder={hint.body}
                      onChange={(e) => change(i, { body: e.target.value })}
                      aria-invalid={err(`body_${i + 1}`) || bodyLen > BODY_MAX || link ? true : undefined}
                      className={field}
                    />
                    <p className={`text-xs tabular-nums ${bodyLen > BODY_MAX ? "font-semibold text-danger" : "text-muted"}`}>
                      {bodyLen} of {BODY_MAX} characters{bodyLen > BODY_MAX ? `: ${bodyLen - BODY_MAX} too many` : ""}
                    </p>
                    {link ? <p className="text-sm font-semibold text-danger">Leave out web addresses: we add a button to your page on Givezy ourselves.</p> : null}
                    {err(`body_${i + 1}`) ? <p role="alert" className="text-sm font-semibold text-danger">{err(`body_${i + 1}`)}</p> : null}
                  </div>
                  {/* A picture above the words (optional): uploaded at once, kept with the email when it is saved. */}
                  <div className="space-y-2">
                    <input type="hidden" name={`image_path_${i + 1}`} value={d.imagePath} />
                    {d.imagePath ? (
                      <>
                        <p className="text-sm font-semibold">Picture</p>
                        {/* eslint-disable-next-line @next/next/no-img-element -- the charity's own uploaded picture, as the email shows it */}
                        <img src={d.imageUrl} alt={d.imageAlt.trim() || "Your picture"} className="max-h-48 w-auto max-w-full rounded-control border-2 border-border object-contain" />
                        <div className="space-y-1">
                          <label htmlFor={`${id}-alt-${i}`} className="block text-sm font-semibold">What the picture shows</label>
                          <input
                            id={`${id}-alt-${i}`}
                            name={`image_alt_${i + 1}`}
                            dir="auto"
                            value={d.imageAlt}
                            maxLength={PICTURE_ALT_MAX + 20}
                            placeholder="For example: Children at our after-school club"
                            onChange={(e) => change(i, { imageAlt: e.target.value })}
                            aria-invalid={err(`image_alt_${i + 1}`) ? true : undefined}
                            aria-describedby={`${id}-alt-${i}-hint`}
                            className={field}
                          />
                          <p id={`${id}-alt-${i}-hint`} className={`text-xs ${err(`image_alt_${i + 1}`) ? "font-semibold text-danger" : "text-muted"}`}>
                            {err(`image_alt_${i + 1}`) ?? "A few words for people who can't see pictures, and for email apps that hide them."}
                          </p>
                        </div>
                        <button type="button" onClick={() => change(i, { imagePath: "", imageUrl: "", imageAlt: "" })} className="min-h-11 px-1 text-sm font-medium text-danger underline">
                          Remove the picture
                        </button>
                      </>
                    ) : uploadPicture ? (
                      <div className="space-y-1">
                        <label htmlFor={`${id}-pic-${i}`} className="block text-sm font-semibold">
                          A picture <span className="font-normal text-muted">(optional)</span>
                        </label>
                        <input
                          id={`${id}-pic-${i}`}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={uploading !== null}
                          onChange={(e) => {
                            void addPicture(i, d, e.currentTarget.files?.[0]);
                            e.currentTarget.value = "";
                          }}
                          className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-control file:border-2 file:border-outline file:bg-surface file:px-4 file:font-semibold file:text-brand"
                        />
                        <p role="status" className="text-xs text-muted">
                          {uploading === d.key ? "Uploading the picture…" : "JPG, PNG or WebP, up to 4 MB. It shows above your words."}
                        </p>
                      </div>
                    ) : null}
                    {err(`image_${i + 1}`) ? <p role="alert" className="text-sm font-semibold text-danger">{err(`image_${i + 1}`)}</p> : null}
                    {pictureError?.key === d.key ? <p role="alert" className="text-sm font-semibold text-danger">{pictureError.message}</p> : null}
                  </div>

                  <div className="flex flex-wrap gap-x-3">
                    {/* Only on an empty email, so it never replaces words the charity has written. */}
                    {example && !d.before && !d.subject.trim() && !d.body.trim() ? (
                      <button
                        type="button"
                        onClick={() => {
                          change(i, { subject: example.subject, body: example.body, before: { subject: d.subject, body: d.body } });
                          setShowing(i);
                        }}
                        className="min-h-11 px-1 text-sm font-medium text-brand underline"
                      >
                        Show me an example
                      </button>
                    ) : null}
                    {d.before ? (
                      <button
                        type="button"
                        onClick={() => change(i, { subject: d.before!.subject, body: d.before!.body, before: undefined })}
                        className="min-h-11 px-1 text-sm font-medium text-brand underline"
                      >
                        Undo the example
                      </button>
                    ) : null}
                    <button type="button" onClick={() => setShowing(i)} className="min-h-11 px-1 text-sm font-medium text-brand underline">
                      Preview this email
                    </button>
                    {canRemoveStep(i, drafts.length, onIt) ? (
                      <button type="button" onClick={() => remove(i)} className="min-h-11 px-1 text-sm font-medium text-danger underline">
                        Remove email {i + 1}
                      </button>
                    ) : null}
                  </div>
                  {d.before ? <p className="text-xs text-muted">Our example is in. Change it so it sounds like you, or undo it.</p> : null}
                  {canRemoveStep(i, drafts.length, onIt) ? null : <p className="text-xs text-muted">{middleStepWords(onIt)}</p>}
                </fieldset>
                </div>
              </li>
            );
          })}

          {/* What next: the prompt at the end of the journey. */}
          <li className="relative">
            <span aria-hidden="true" className="absolute -left-[1.85rem] top-4 size-3 rounded-full border-2 border-honey bg-surface" />
            <div className="space-y-2 rounded-card border-2 border-dashed border-honey bg-honey-soft/60 p-4 text-sm">
              <p className="font-display text-base font-bold text-indigo">{drafts.length === 0 ? "What would you like to happen first?" : "What would you like next?"}</p>
              {canAdd ? (
                <>
                  <p className="text-muted">
                    {drafts.length === 0
                      ? "A thank-you a day or two after someone gives is a good place to start."
                      : "Another email a few weeks later keeps them close: some news, a moment from your work, a way to help. Or stop here."}
                  </p>
                  <button type="button" onClick={add} className="pressable inline-flex min-h-11 items-center rounded-control bg-brand px-4 text-sm font-semibold text-brand-contrast">
                    {drafts.length === 0 ? "Send an email" : "Wait, then send another email"}
                  </button>
                </>
              ) : (
                <p className="text-muted">{JOURNEY_MAX_STEPS} emails is the most a journey has. Your journey ends here.</p>
              )}
            </div>
          </li>
        </ol>

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
