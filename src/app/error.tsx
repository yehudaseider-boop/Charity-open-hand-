"use client";

import Link from "next/link";
import { useEffect } from "react";
import { SupportContact } from "@/components/legal";

/**
 * Something broke on the server or in the page: say so plainly and offer a way on. The same card, heading and
 * buttons as the charities list's error (24/11/2026: this one had small plain buttons, so a charity page or the
 * give form failing looked like a different site from the list a tap before).
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="relative isolate flex flex-col items-start gap-3 overflow-hidden rounded-[1.5rem] bg-honey-soft p-6 sm:p-8">
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 -z-10 h-32 w-32 rounded-full bg-peach" />
      <h1 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] leading-tight">Something went wrong</h1>
      <p className="max-w-[36rem] text-muted">
        {typeof navigator !== "undefined" && navigator.onLine === false
          ? "You're offline, so this page couldn't open. Check your connection and try again."
          : "This page couldn't open. Please try again in a moment."}
      </p>
      <p className="max-w-[36rem] text-sm text-muted">
        If it keeps happening: <SupportContact />{error.digest ? `, and quote reference ${error.digest}` : ""}.
      </p>
      <div className="flex flex-wrap gap-3 pt-1">
        <button type="button" onClick={() => retry()} className="pressable inline-flex min-h-12 items-center rounded-[1.125rem] bg-brand px-5 font-bold text-white">Try again</button>
        <Link href="/" className="inline-flex min-h-12 items-center rounded-[1.125rem] border-2 border-outline bg-surface px-5 font-bold text-brand hover:border-brand">Go to the home page</Link>
      </div>
    </div>
  );
}
