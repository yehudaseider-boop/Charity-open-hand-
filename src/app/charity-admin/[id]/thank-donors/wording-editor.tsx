"use client";

import { startTransition, useActionState, useId, useMemo, useState } from "react";
import { cleanThankYouNote, THANK_YOU_NOTE_MAX } from "@/lib/charity/thank-you-note";
import { confirmationEmail } from "@/lib/donations/confirmation-email";
import { textEmailHtml } from "@/lib/email/html";
import { initialFormState, type FormState } from "@/lib/form";

/** A made-up gift for the preview: never a real donor's. */
const SAMPLE = { id: "00000000-0000-4000-8000-000000000000", amountCents: 25_000 };

/**
 * The charity's own paragraph in the thank-you email after each gift, with the whole email shown beside it
 * as a donor gets it (the same code writes the real one). Givezy's lines can't be edited here or anywhere.
 */
export function WordingEditor({
  action,
  charityName,
  saved,
  sampleDate,
  siteUrl,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  charityName: string;
  /** The note as it is saved now (null: Givezy's wording, no note). */
  saved: string | null;
  /** "Today", from the server, so the preview is the same on both sides. */
  sampleDate: string;
  siteUrl?: string;
}) {
  // A dropped connection stays on this form with everything typed kept (as ActionForm does).
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
  const [value, setValue] = useState(saved ?? "");
  const id = useId();

  const note = cleanThankYouNote(value);
  const length = note?.length ?? 0;
  const over = length - THANK_YOU_NOTE_MAX;
  const dirty = (note ?? null) !== (saved ?? null);
  const error = state.fieldErrors?.note;

  const email = useMemo(
    () =>
      confirmationEmail({
        id: SAMPLE.id,
        charityName,
        charityNote: note,
        amountCents: SAMPLE.amountCents,
        contributionCents: 0,
        totalCents: SAMPLE.amountCents,
        paidAt: sampleDate,
        wants18a: true,
      }),
    [charityName, note, sampleDate],
  );
  const html = useMemo(() => textEmailHtml({ subject: email.subject, text: email.text, siteUrl, quoted: email.quoted }), [email, siteUrl]);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form
        className="space-y-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          startTransition(() => dispatch(formData));
        }}
      >
        <div className="space-y-1">
          <label htmlFor={id} className="block text-sm font-semibold">
            Your thank-you note <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea
            id={id}
            name="note"
            rows={6}
            dir="auto"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error || over > 0 ? true : undefined}
            aria-describedby={`${id}-hint ${id}-count${error ? ` ${id}-error` : ""}`}
            className="w-full rounded-[0.875rem] border-2 border-border bg-surface px-3.5 py-2.5 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand-soft aria-invalid:border-danger"
          />
          <p id={`${id}-count`} className={`text-xs tabular-nums ${over > 0 ? "font-semibold text-danger" : "text-muted"}`}>
            {over > 0
              ? `${length} of ${THANK_YOU_NOTE_MAX} characters: ${over} too many. Shorten it to save.`
              : `${length} of ${THANK_YOU_NOTE_MAX} characters`}
          </p>
          <p id={`${id}-hint`} className="text-xs text-muted">
            Plain words in your own voice. Line breaks are kept. No web addresses or formatting. Leave it empty for Givezy&apos;s wording alone.
          </p>
          {error ? (
            <p id={`${id}-error`} role="alert" className="text-sm font-semibold text-danger">{error}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            name="intent"
            value="save"
            disabled={pending}
            className="pressable inline-flex min-h-11 items-center rounded-control bg-brand px-4 text-sm font-semibold text-brand-contrast disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {saved ? (
            <button
              name="intent"
              value="reset"
              disabled={pending}
              className="inline-flex min-h-11 items-center rounded-control border-2 border-border px-4 text-sm font-semibold text-brand disabled:opacity-60"
            >
              Back to Givezy&apos;s wording
            </button>
          ) : null}
        </div>
        <p role={state.message && !state.ok && !pending ? "alert" : "status"} className={`text-sm ${state.message && !state.ok && !pending ? "text-danger" : "text-muted"}`}>
          {pending
            ? "Saving, please wait…"
            : state.message && (!state.ok || !dirty)
              ? state.message
              : dirty
                ? "Not saved yet. Donors keep getting the saved wording until you press Save."
                : saved
                  ? "Saved. Donors get this note in the thank-you email after each gift."
                  : "You're on Givezy's wording: the thank-you email goes out with no note from you."}
        </p>

        <div className="rounded-control bg-honey-soft p-3 text-sm text-navy">
          <p className="font-semibold">What Givezy writes, and you can&apos;t change</p>
          <p className="mt-1 text-muted">
            The subject, the amount, the date, the reference, your charity&apos;s name, the line about the s18A receipt, the
            monthly donation wording and the sign-off. They are the donor&apos;s record of the gift, so they are the same for every charity.
            Your note sits in its own box, labelled as yours.
          </p>
        </div>
      </form>

      <section aria-label="Preview of the thank-you email" className="min-w-0 space-y-2">
        <p className="text-sm font-semibold">What the donor gets</p>
        <p className="text-xs text-muted">
          A sample only: a made-up R250 gift with a made-up reference. Each donor sees their own amount, date and reference.
          {dirty ? " This preview shows what you have typed, not yet saved." : ""}
        </p>
        <p className="text-sm [overflow-wrap:anywhere]">
          <span className="text-muted">Subject: </span>
          <span dir="auto">{email.subject}</span>
        </p>
        {/* The real email's HTML, shut in a frame that can run nothing and open nothing. */}
        <iframe
          title="Preview of the thank-you email"
          sandbox=""
          srcDoc={html}
          className="h-[34rem] w-full rounded-control border-2 border-border bg-white"
        />
      </section>
    </div>
  );
}
