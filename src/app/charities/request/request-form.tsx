"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { FormStateProvider } from "@/components/forms/action-form";
import { TextArea, TextField } from "@/components/forms/fields";
import { CHARITY_REQUEST_CONSENT, CHARITY_REQUEST_LIMITS as L, CHARITY_REQUEST_MESSAGES } from "@/lib/charity-requests";
import { requestCharity, type RequestFormState } from "./actions";
import { BotCheck, type BotCheckHandle } from "@/components/forms/bot-check";
import { botCheckConfig } from "@/config/bot-check";

/**
 * "Request a charity" (15/11/2026). Everything typed stays when something goes wrong; the answer is read out to
 * screen readers. The email box shows only once "Email me when it joins" is ticked.
 */
export function RequestForm({ defaultName, defaultEmail, botCheckKey = null }: { defaultName: string; defaultEmail: string; botCheckKey?: string | null }) {
  const botCheck = useRef<BotCheckHandle>(null);
  const safe = async (prev: RequestFormState, data: FormData): Promise<RequestFormState> => {
    // The bot check (when on, 23/11/2026): if Cloudflare wants a tick or couldn't load, nothing is sent and the check
    // says so by the button; what was typed stays.
    if (botCheckKey) {
      const human = await botCheck.current?.token();
      if (!human?.ok) return { ...prev, message: undefined };
      data.set(botCheckConfig.field, human.token);
      botCheck.current?.used();
    }
    try {
      return await requestCharity(prev, data);
    } catch {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      return { ok: false, message: offline ? CHARITY_REQUEST_MESSAGES.offline : CHARITY_REQUEST_MESSAGES.unreachable };
    }
  };
  const [state, dispatch, pending] = useActionState(safe, { ok: false } as RequestFormState);
  const [emailMe, setEmailMe] = useState(false);
  // A fresh form after "Ask for another charity" (the key remounts it empty).
  const [round, setRound] = useState(0);
  // The answer put away by "Ask for another charity": until the next send, the page shows a fresh form.
  const [cleared, setCleared] = useState<RequestFormState | null>(null);
  const shown = state === cleared ? null : state;
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.fieldErrors) return;
    const first = formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]");
    first?.focus();
    first?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [state]);

  if (shown?.ok) {
    return (
      <div className="space-y-4">
        <p role="status" className="flex items-start gap-3 rounded-[1.25rem] bg-success-soft px-5 py-4 text-[16px] font-semibold text-success">
          <svg aria-hidden viewBox="0 0 24 24" width="22" height="22" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 stroke-success"><path d="M5 12l5 5L20 7" /></svg>
          <span className="[overflow-wrap:anywhere]">{shown.message}</span>
        </p>
        <div className="flex flex-wrap gap-3">
          {shown.existing ? (
            <Link href={`/c/${shown.existing.slug}`} className="pressable inline-flex min-h-12 items-center rounded-[1.125rem] bg-brand px-5 font-bold text-white">
              See {shown.existing.name}
            </Link>
          ) : (
            <Link href="/charities" className="pressable inline-flex min-h-12 items-center rounded-[1.125rem] bg-brand px-5 font-bold text-white">
              Back to charities
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              setCleared(state);
              setEmailMe(false);
              setRound((r) => r + 1);
            }}
            className="inline-flex min-h-12 items-center rounded-[1.125rem] border-2 border-border bg-surface px-5 font-bold text-brand hover:border-brand"
          >
            Ask for another charity
          </button>
        </div>
      </div>
    );
  }

  const fieldState = shown ?? { ok: false };
  return (
    <FormStateProvider state={fieldState}>
      <form
        key={round}
        ref={formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => dispatch(data));
        }}
        className="space-y-5"
      >
        <TextField name="name" label="Charity's name" required autoDirection maxLength={L.name} defaultValue={round === 0 ? defaultName : ""} autoComplete="off" />
        <TextField name="town" label="Town or area" autoDirection maxLength={L.town} autoComplete="off" hint="So we find the right one. For example Soweto, or Sea Point." />
        <TextField name="link" label="Website or social media page" type="url" inputMode="url" maxLength={L.link} autoComplete="off" hint="If you know it. A Facebook or Instagram page is fine." />
        <TextArea name="note" label="Anything we should know" rows={3} maxLength={L.note} />
        {/* A hidden field people never see: a bot that fills it is told "sent" and nothing is saved. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />

        <div className="space-y-3 rounded-[1.25rem] bg-honey-soft p-4">
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-[16px] font-semibold">
            <input
              type="checkbox"
              name="email_me"
              checked={emailMe}
              onChange={(e) => setEmailMe(e.target.checked)}
              aria-describedby="request-consent"
              className="mt-0.5 h-6 w-6 shrink-0 accent-brand"
            />
            <span>{CHARITY_REQUEST_CONSENT.label} <span className="font-normal text-muted">(optional)</span></span>
          </label>
          {emailMe ? <TextField name="email" label="Your email address" required type="email" inputMode="email" autoComplete="email" maxLength={L.email} defaultValue={defaultEmail} /> : null}
          <p id="request-consent" className="text-[14px] leading-relaxed text-muted">{CHARITY_REQUEST_CONSENT.text}</p>
        </div>

        {botCheckKey ? <BotCheck siteKey={botCheckKey} action="charity-request" kind="charity-request" button="Send request" handleRef={botCheck} /> : null}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="pressable inline-flex min-h-14 items-center justify-center rounded-[1.125rem] bg-coral px-7 text-[17px] font-bold text-navy disabled:opacity-70">
            {pending ? "Sending…" : "Send request"}
          </button>
          {pending ? <p role="status" className="text-sm text-muted">Sending your request, please wait…</p> : null}
        </div>
        {/* One field's problem shows by that field; a summary only for several, or a problem with no field. */}
        {fieldState.message && !fieldState.ok && !pending && Object.keys(fieldState.fieldErrors ?? {}).length !== 1 ? (
          <p role="alert" className="rounded-control bg-danger-soft p-3 text-[15px] font-medium text-danger">{fieldState.message}</p>
        ) : null}
      </form>
    </FormStateProvider>
  );
}
