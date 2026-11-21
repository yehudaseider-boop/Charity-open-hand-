"use client";

import { useActionState } from "react";
import { connectionTroubleMessage } from "@/components/forms/action-form";
import { PendingButton } from "@/components/forms/pending-button";
import { SafeForm } from "@/components/forms/safe-form";
import { startEnrol, verifyCode, type EnrolState } from "./actions";

export function Enrol({ next }: { next: string }) {
  // A dropped connection says so here and leaves Set up to press again, rather than throwing the page away (21/11/2026).
  const [state, start, pending] = useActionState<EnrolState, FormData>(async () => {
    try {
      return await startEnrol();
    } catch (e) {
      return { error: connectionTroubleMessage(e) };
    }
  }, {});
  if (!state.factorId) {
    return (
      <form action={start} className="space-y-3">
        <p className="text-sm text-muted">
          Charity accounts need a second step when signing in. Use an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or Authy.
        </p>
        {state.error ? <p role="alert" className="text-sm text-danger">{state.error}</p> : null}
        <button disabled={pending} className="pressable w-full rounded-control bg-coral px-4 py-3 font-bold text-navy disabled:opacity-50">
          Set up authenticator app
        </button>
      </form>
    );
  }
  return (
    <SafeForm action={verifyCode} className="space-y-3">
      <p className="text-sm">1. Scan this code with your authenticator app.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={state.qr} alt="QR code for your authenticator app" width={192} height={192} className="mx-auto rounded-control border-2 border-border bg-surface p-2" />
      <p className="text-xs text-muted">Can&apos;t scan? Enter this key instead: <span className="break-all font-mono">{state.secret}</span></p>
      <p className="text-sm">2. Enter the 6-digit code it shows.</p>
      <input type="hidden" name="factorId" value={state.factorId} />
      <input type="hidden" name="next" value={next} />
      <CodeField />
      <PendingButton pendingLabel="Checking…" className="pressable w-full rounded-control bg-coral px-4 py-3 font-bold text-navy">Confirm and continue</PendingButton>
    </SafeForm>
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
      className="w-full rounded-control border-2 border-border bg-surface px-3 py-2.5 text-center text-lg tracking-widest"
    />
  );
}
