"use client";

import { useActionState } from "react";
import { setUpApp, verifyCode, type TwoStepState } from "./actions";

const initial: TwoStepState = { ok: false };

function CodeField() {
  return (
    <div className="space-y-1">
      <label htmlFor="code" className="block text-sm font-medium">6-digit code</label>
      <input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        required
        className="w-40 rounded-control border border-border bg-surface px-3 py-2.5 text-lg tracking-widest"
      />
    </div>
  );
}

function Message({ state }: { state: TwoStepState }) {
  return state.message ? <p role="status" className="text-sm text-danger">{state.message}</p> : null;
}

export function VerifyForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(verifyCode, initial);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <CodeField />
      <Message state={state} />
      <button disabled={pending} className="rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast disabled:opacity-60">
        {pending ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}

export function EnrolForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(setUpApp, initial);
  const enrolment = state.enrolment;

  if (!enrolment) {
    return (
      <form action={action} className="space-y-3">
        <input type="hidden" name="step" value="start" />
        <Message state={state} />
        <button disabled={pending} className="rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast disabled:opacity-60">
          {pending ? "Starting…" : "Set up authenticator app"}
        </button>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="step" value="confirm" />
      <input type="hidden" name="next" value={next} />
      <ol className="list-decimal space-y-3 pl-5 text-sm">
        <li>
          Open your authenticator app (for example Google Authenticator or Microsoft Authenticator) and scan this code.
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrolment.qrCode} alt="QR code to add this account to your authenticator app" className="mt-2 h-44 w-44 rounded-control border border-border bg-white p-2" />
          <span className="mt-2 block text-muted">
            Can&apos;t scan it? Enter this key instead: <code className="break-all font-mono text-text">{enrolment.secret}</code>
          </span>
        </li>
        <li>Type the 6-digit code the app shows.</li>
      </ol>
      <CodeField />
      <Message state={state} />
      <button disabled={pending} className="rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast disabled:opacity-60">
        {pending ? "Checking…" : "Finish setup"}
      </button>
    </form>
  );
}
