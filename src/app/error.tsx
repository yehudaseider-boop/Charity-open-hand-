"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Something broke on the server or in the page: say so plainly and offer a way on. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="space-y-4 rounded-card border border-border bg-surface p-5">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted">
        This page couldn&apos;t load. Please try again in a moment. If it keeps happening, let us know
        {error.digest ? ` and quote reference ${error.digest}` : ""}.
      </p>
      <div className="flex flex-wrap gap-3">
        <button onClick={() => retry()} className="rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast">Try again</button>
        <Link href="/" className="rounded-control border border-border px-4 py-2.5 font-medium">Go to the home page</Link>
      </div>
    </div>
  );
}
