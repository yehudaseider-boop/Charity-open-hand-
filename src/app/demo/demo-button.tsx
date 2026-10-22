"use client";

import { useState } from "react";

/**
 * One person's sign-in form. Says "Signing in…" once pressed, so a slow network doesn't look like
 * nothing happened (a plain form post, so the browser does the rest).
 */
export function DemoSignInForm({ who, label }: { who: string; label: string }) {
  const [pending, setPending] = useState(false);
  return (
    <form action="/demo/sign-in" method="post" className="mt-4" onSubmit={() => setPending(true)}>
      <input type="hidden" name="who" value={who} />
      <button
        aria-disabled={pending}
        className="pressable w-full rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast aria-disabled:opacity-70"
      >
        {pending ? "Signing in…" : label}
      </button>
    </form>
  );
}
