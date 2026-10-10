"use client";

import { useActionState } from "react";
import { startEnrol, verifyCode, type EnrolState } from "./actions";

export function Enrol({ next }: { next: string }) {
  const [state, start, pending] = useActionState<EnrolState, FormData>(() => startEnrol(), {});
  if (!state.factorId) {
    return (
      <form action={start} className="space-y-3">
        <p className="text-sm text-muted">
          Charity accounts need a second step when signing in. Use an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or Authy.
        </p>
        {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
        <button disabled={pending} className="w-full rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast disabled:opacity-50">
          Set up authenticator app
        </button>
      </form>
    );
  }
  return (
    <form action={verifyCode} className="space-y-3">
      <p className="text-sm">1. Scan this code with your authenticator app.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={state.qr} alt="QR code for your authenticator app" width={192} height={192} className="mx-auto rounded-control border border-border bg-white p-2" />
      <p className="text-xs text-muted">Can&apos;t scan? Enter this key instead: <span className="break-all font-mono">{state.secret}</span></p>
      <p className="text-sm">2. Enter the 6-digit code it shows.</p>
      <input type="hidden" name="factorId" value={state.factorId} />
      <input type="hidden" name="next" value={next} />
      <CodeField />
      <button className="w-full rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast">Confirm and continue</button>
    </form>
  );
}

export function CodeField() {
  return (
    <input
      name="code"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9 ]{6,7}"
      maxLength={7}
      required
      aria-label="6-digit code"
      className="w-full rounded-control border border-border bg-surface px-3 py-2.5 text-center text-lg tracking-widest"
    />
  );
}
