"use client";

import Link from "next/link";
import { useEffect } from "react";
import { SupportContact } from "@/components/legal";

/**
 * The charities list couldn't load: say so plainly, say nothing was lost (it is only a list), and offer Try again,
 * with the rest of the site a tap away. Also used by the cached plain list (app/browse-charities).
 */
export default function CharitiesError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    <div className="full-bleed overflow-x-clip">
      <section className="mx-auto max-w-[75rem] px-4 pb-12 pt-8 sm:px-6 sm:pt-12">
        <div role="alert" className="relative isolate flex flex-col items-start gap-3 overflow-hidden rounded-[1.5rem] bg-honey-soft p-6 sm:p-8">
          <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 -z-10 h-32 w-32 rounded-full bg-peach" />
          <h1 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] leading-tight">The charities didn&apos;t load</h1>
          <p className="max-w-[36rem] text-muted">
            {offline
              ? "You're offline, so we couldn't fetch the list. Check your connection and try again."
              : "We couldn't fetch the list just now. Please try again in a moment."}
          </p>
          <p className="max-w-[36rem] text-sm text-muted">
            If it keeps happening: <SupportContact />{error.digest ? `, and quote reference ${error.digest}` : ""}.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <button type="button" onClick={() => retry()} className="pressable inline-flex min-h-12 items-center rounded-[1.125rem] bg-brand px-5 font-bold text-white">Try again</button>
            <Link href="/" className="inline-flex min-h-12 items-center rounded-[1.125rem] border-2 border-border bg-surface px-5 font-bold text-brand hover:border-brand">Go to the home page</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
