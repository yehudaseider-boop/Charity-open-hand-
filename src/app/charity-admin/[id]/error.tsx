"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

/**
 * Something failed on a dashboard page (a lost connection, a server error). The header and tabs stay;
 * this says plainly that nothing was changed, and what to do now.
 */
export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { id } = useParams<{ id: string }>();
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    <section role="alert" className="space-y-3 rounded-card border border-border bg-honey-soft p-5">
      <h1 className="font-display text-xl text-indigo">{offline ? "You're offline" : "That didn't go through"}</h1>
      <p className="text-sm text-navy">
        {offline
          ? "Nothing was changed. Check your connection, then try again."
          : "Nothing was changed. It's usually a dropped connection: try again in a moment."}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button onClick={reset} className="rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast">Try again</button>
        <Link href={`/charity-admin/${id}`} className="text-sm text-brand underline">Back to your overview</Link>
      </div>
      <p className="text-xs text-muted">If it keeps happening, reply to any email we&apos;ve sent you and a person will help.</p>
    </section>
  );
}
