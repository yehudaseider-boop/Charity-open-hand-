"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Card } from "@/components/card";
import { Icon } from "@/components/marketing";
import type { StartItem } from "@/lib/charity/checklist";

/**
 * "Getting started" on the charity overview (extended 10/11/2026). Each step ticks itself off from real data; a step's
 * button shows only to roles that may do it, others read who does it. Once every step that counts is done, it says so
 * once ("You're all set") and can be put away; that choice is kept in this browser only and never hides anything
 * that isn't done.
 */
export function GettingStarted({
  items,
  progress,
  storageKey,
  children,
}: {
  items: StartItem[];
  progress: { done: number; total: number; allSet: boolean };
  storageKey: string;
  /** The share tools, shown under the steps while there is still something to do. */
  children?: React.ReactNode;
}) {
  // Only the "all set" moment can be put away. This browser's choice is read after the page has drawn (on the server
  // and in the first paint it's unknown), so the moment never flashes in and out.
  const stored = useSyncExternalStore(subscribe, () => readHidden(storageKey), () => null);
  const [hiddenNow, setHiddenNow] = useState(false);
  const hidden = hiddenNow || stored;

  if (progress.allSet) {
    if (hidden !== false) return null;
    const hide = () => {
      setHiddenNow(true);
      try {
        window.localStorage.setItem(storageKey, "hidden");
      } catch {
        // Kept for this visit only.
      }
    };
    return (
      <section aria-label="Getting started" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-success/30 bg-success-soft px-4 py-3">
        <p className="flex items-center gap-2 text-sm">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white">
            <Icon name="check" className="stroke-success" size={18} />
          </span>
          <span>
            <span className="font-bold">You&apos;re all set.</span> Everything that helps donors find you and give is in place.
          </span>
        </p>
        <button type="button" onClick={hide} className="min-h-11 rounded-control px-3 text-sm font-semibold text-brand underline">
          Hide this
        </button>
      </section>
    );
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <Card title="Getting started">
      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-label="Getting started"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          aria-valuetext={`${progress.done} of ${progress.total} done`}
          className="h-2 flex-1 overflow-hidden rounded-full bg-border"
        >
          <div className="h-full rounded-full bg-brand transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
        </div>
        <p className="shrink-0 text-sm font-semibold">
          {progress.done} of {progress.total} done
        </p>
      </div>

      <ul className="mt-4 divide-y divide-border">
        {items.map((i) => (
          <li key={i.key} className="flex items-start gap-3 py-3">
            <span
              aria-hidden
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${i.done ? "bg-success-soft" : "border-2 border-border bg-white"}`}
            >
              {i.done ? <Icon name="check" className="stroke-success" size={16} /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${i.done ? "text-muted" : ""}`}>
                {i.label}
                {i.optional ? <span className="font-normal text-muted"> (optional)</span> : null}
                <span className="sr-only">{i.done ? ": done" : ": not done yet"}</span>
              </p>
              {i.done ? null : <p className="mt-0.5 text-sm text-muted">{i.why}</p>}
              {!i.done && (!i.can || !i.href) && i.who ? <p className="mt-1 text-xs text-muted">{i.who}</p> : null}
            </div>
            {!i.done && i.can && i.href ? (
              <Link
                href={i.href}
                className="pressable inline-flex min-h-11 shrink-0 items-center rounded-control bg-brand px-4 text-sm font-bold text-white"
                aria-label={`${i.label}: open`}
              >
                Open
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
      {children}
    </Card>
  );
}

/** Nothing to listen to: the choice only changes from this page, which also sets its own state. */
function subscribe(): () => void {
  return () => {};
}

/** Whether this browser put the "all set" moment away. Storage blocked (private browsing): not hidden. */
function readHidden(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "hidden";
  } catch {
    return false;
  }
}
