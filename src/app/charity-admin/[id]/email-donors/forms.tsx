"use client";

import { startTransition, useActionState, useState } from "react";
import { ActionForm } from "@/components/forms/action-form";
import { blueAction, field } from "@/components/dash";
import { APPEAL_BODY_MAX, APPEAL_SUBJECT_MAX, APPEALS_PER_MONTH } from "@/lib/charity/appeals-rules";
import type { FormState } from "@/lib/form";
import type { AppealCheck } from "./actions";

type Option = { value: string; label: string };

/**
 * Write an email to donors, see who it goes to, send yourself a test, then send. What's typed stays on
 * the page through every step and every refusal. Changing anything after checking means checking again.
 */
export function AppealForm({
  check,
  test,
  send,
  audiences,
  initialAudience,
  initialSubject = "",
  initialBody = "",
}: {
  check: (s: AppealCheck, f: FormData) => Promise<AppealCheck>;
  test: (s: FormState, f: FormData) => Promise<FormState>;
  send: (s: FormState, f: FormData) => Promise<FormState>;
  audiences: { group: string; options: Option[] }[];
  initialAudience: string;
  initialSubject?: string;
  initialBody?: string;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [audience, setAudience] = useState(initialAudience);
  const [checkedFor, setCheckedFor] = useState<string | null>(null);
  const now = `${audience}\n${subject}\n${body}`;
  const safeCheck = async (prev: AppealCheck, f: FormData): Promise<AppealCheck> => {
    try {
      const r = await check(prev, f);
      if (r.state === "checked") setCheckedFor(now);
      return r;
    } catch {
      return { state: "refused", message: typeof navigator !== "undefined" && !navigator.onLine ? "You're offline. What you wrote is still here. Check again when you're back online." : "We couldn't check just now. What you wrote is still here. Please try again." };
    }
  };
  const [preview, runCheck, checking] = useActionState(safeCheck, { state: "idle" } as AppealCheck);
  const stale = preview.state === "checked" && checkedFor !== now;
  const fields = (f: FormData) => {
    f.set("subject", subject);
    f.set("body", body);
    f.set("audience", audience);
  };
  const errors = preview.state === "refused" ? preview.fieldErrors ?? {} : {};

  return (
    <div className="space-y-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData();
            fields(f);
            startTransition(() => runCheck(f));
          }}
        >
          <div className="space-y-1">
            <label htmlFor="audience" className="block text-sm font-semibold text-navy">Who it goes to</label>
            <select id="audience" value={audience} onChange={(e) => setAudience(e.currentTarget.value)} className={`${field} w-full`}>
              {audiences.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </optgroup>
              ))}
            </select>
            {errors.audience ? <p role="alert" className="text-xs text-danger">{errors.audience}</p> : null}
          </div>
          <div className="space-y-1">
            <label htmlFor="subject" className="block text-sm font-semibold text-navy">Subject</label>
            <input id="subject" value={subject} onChange={(e) => setSubject(e.currentTarget.value)} maxLength={APPEAL_SUBJECT_MAX} aria-invalid={errors.subject ? true : undefined} className={`${field} w-full aria-invalid:border-danger`} />
            {errors.subject ? <p role="alert" className="text-xs text-danger">{errors.subject}</p> : <p className="text-xs text-muted">What donors see in their inbox. For example: Winter parcels, how you helped.</p>}
          </div>
          <div className="space-y-1">
            <label htmlFor="body" className="block text-sm font-semibold text-navy">Your message</label>
            <textarea id="body" rows={10} value={body} onChange={(e) => setBody(e.currentTarget.value)} maxLength={APPEAL_BODY_MAX} aria-invalid={errors.body ? true : undefined} className={`${field} w-full py-2.5 aria-invalid:border-danger`} />
            {errors.body ? (
              <p role="alert" className="text-xs text-danger">{errors.body}</p>
            ) : (
              <p className="text-xs text-muted">Plain text, up to 5 000 characters. Each donor sees &quot;Dear&quot; and their first name above it, your charity&apos;s name below it, and a link to stop these emails. Use real numbers only.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={checking} className={`${blueAction} disabled:opacity-60`}>
              {checking ? "Checking…" : "Check who it goes to"}
            </button>
            {checking ? <p role="status" className="text-sm text-muted">Checking, please wait… Nothing is sent.</p> : null}
          </div>
        </form>

      {preview.state === "refused" ? <p role="alert" className="rounded-card bg-danger-soft p-3 text-sm text-danger">{preview.message}</p> : null}

      {preview.state === "checked" ? (
        <section aria-label="Who it goes to" className="space-y-3 rounded-card border-2 border-brand/40 bg-honey-soft p-4 text-sm sm:p-5">
          {stale ? (
            <p role="status" className="rounded-card bg-warning-soft p-3 text-warning">You changed something since you checked. Press Check who it goes to again before sending.</p>
          ) : (
            <>
              <p className="font-display text-lg font-bold text-indigo [overflow-wrap:anywhere]">
                {preview.count ? `${preview.label}: ${preview.count} ${preview.count === 1 ? "donor" : "donors"}.` : `${preview.label}: nobody to send it to.`}
              </p>
              {preview.stopped ? <p className="text-muted">{preview.stopped} more {preview.stopped === 1 ? "is" : "are"} left out because they asked not to get emails.</p> : null}
              {preview.recordedOnly ? (
                <p className="text-muted">
                  {preview.recordedOnly} {preview.recordedOnly === 1 ? "donor who has" : "donors who have"} only given by EFT, cash or a file you imported {preview.recordedOnly === 1 ? "is" : "are"} left out for now: we&apos;re checking with our lawyer that we may email them for you.
                </p>
              ) : null}
              <p className="text-muted">Anyone who has already had {APPEALS_PER_MONTH} emails from you in the last 30 days is left out too, and counted after sending.</p>
              <ActionForm action={async (s, f) => (fields(f), test(s, f))} submitLabel="Send me a test" pendingLabel="Sending the test…" />
              {preview.count ? (
                <ActionForm
                  action={async (s, f) => (fields(f), f.set("fingerprint", preview.fingerprint), send(s, f))}
                  submitLabel={`Send to ${preview.count} ${preview.count === 1 ? "donor" : "donors"}`}
                  pendingLabel="Sending… keep this page open"
                  confirm={`Send "${subject.trim()}" to ${preview.count} ${preview.count === 1 ? "donor" : "donors"}? Sent emails can't be called back.`}
                  confirmLabel="Yes, send it"
                />
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}

export function ContinueForm({ action, waiting }: { action: (s: FormState, f: FormData) => Promise<FormState>; waiting: number }) {
  return <ActionForm action={action} submitLabel={`Send the rest (${waiting})`} pendingLabel="Sending… keep this page open" />;
}
