"use client";

import { useActionState, useRef } from "react";
import { BotCheck, type BotCheckHandle } from "@/components/forms/bot-check";
import { botCheckConfig } from "@/config/bot-check";
import type { FreshLinkState } from "@/lib/donations/fresh-link";
import { emailFreshLink } from "./actions";

/**
 * The expired link's one action: "Email me a fresh link". Says what it is doing while it sends, and afterwards the
 * same words whatever happened (see lib/donations/fresh-link.ts). A lost connection is said plainly, with nothing
 * sent and the button still there.
 */
export function FreshLinkForm({ reference, token, botCheckKey = null }: { reference: string; token: string; botCheckKey?: string | null }) {
  const botCheck = useRef<BotCheckHandle>(null);
  const safeAction = async (prev: FreshLinkState, formData: FormData): Promise<FreshLinkState> => {
    // The bot check (when on, 23/11/2026): if Cloudflare wants a tick or couldn't load, nothing is sent and the check
    // says so by the button.
    if (botCheckKey) {
      const human = await botCheck.current?.token();
      if (!human?.ok) return { ok: false };
      formData.set(botCheckConfig.field, human.token);
      botCheck.current?.used();
    }
    try {
      return await emailFreshLink(prev, formData);
    } catch (e) {
      const digest = (e as { digest?: unknown } | null)?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_")) throw e;
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      return {
        ok: false,
        message: offline
          ? "You're offline, so nothing was sent. Check your connection and press the button again."
          : "We couldn't reach Givezy, so the email may not have been sent. Please try again in a moment.",
      };
    }
  };
  const [state, dispatch, pending] = useActionState(safeAction, { ok: false } as FreshLinkState);

  if (state.ok) {
    return (
      <div role="status" className="mt-5 space-y-3 rounded-control bg-honey-soft p-4">
        <p className="font-display text-xl font-bold leading-snug text-indigo">Check your email</p>
        <p className="text-navy">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={dispatch} className="mt-5 space-y-3">
      <input type="hidden" name="reference" value={reference} />
      <input type="hidden" name="t" value={token} />
      {state.message ? (
        <p role="alert" className="rounded-control bg-danger-soft p-3 text-sm text-danger">{state.message}</p>
      ) : null}
      {botCheckKey ? <BotCheck siteKey={botCheckKey} action="fresh-link" kind="fresh-link" button="Email me a fresh link" handleRef={botCheck} /> : null}
      <button
        type="submit"
        disabled={pending}
        aria-disabled={pending}
        className="pressable flex min-h-12 w-full items-center justify-center rounded-control bg-coral px-5 py-3 font-bold text-navy disabled:opacity-70 sm:w-auto"
      >
        {pending ? "Sending…" : "Email me a fresh link"}
      </button>
      <p className="text-sm text-muted">We send it only to the email address this donation was made with.</p>
    </form>
  );
}
