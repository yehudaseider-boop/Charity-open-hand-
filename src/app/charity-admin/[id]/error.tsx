"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { blueAction, secondaryAction } from "@/components/dash";

/**
 * Something failed on a dashboard page (a lost connection, a server error). The header and tabs stay;
 * this says plainly that nothing was changed, and what to do now.
 */
export default function DashboardError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { id } = useParams<{ id: string }>();
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    <section role="alert" className="space-y-3 rounded-card border-2 border-border bg-surface p-5 sm:p-6">
      <h1 className="font-display text-2xl font-bold text-indigo">{offline ? "You're offline" : "That didn't go through"}</h1>
      <p className="text-sm text-navy">
        {offline
          ? "Nothing was changed. Check your connection, then try again."
          : "Nothing was changed. It's usually a dropped connection: try again in a moment."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => retry()} type="button" className={blueAction}>Try again</button>
        <Link href={`/charity-admin/${id}`} className={secondaryAction}>Back to your overview</Link>
      </div>
      <p className="text-xs text-muted">If it keeps happening, reply to any email we&apos;ve sent you and a person will help.</p>
    </section>
  );
}
