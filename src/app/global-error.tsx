"use client";

import Link from "next/link";
import { useEffect } from "react";
import "./globals.css";

/**
 * The last resort when the root layout itself fails. It replaces the whole document, so it brings
 * its own <html> and <body> and the global stylesheet (the brand fonts are not loaded here).
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="en-ZA">
      <body className="flex min-h-screen flex-col font-sans">
        <title>Something went wrong</title>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
          <div className="space-y-4 rounded-card border border-border bg-surface p-5">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted">
              Givezy couldn&apos;t load this page. Please try again in a moment. If it keeps happening, let us know
              {error.digest ? ` and quote reference ${error.digest}` : ""}.
            </p>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => retry()} className="rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast">Try again</button>
              <Link href="/" className="rounded-control border border-border px-4 py-2.5 font-medium">Go to the home page</Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
