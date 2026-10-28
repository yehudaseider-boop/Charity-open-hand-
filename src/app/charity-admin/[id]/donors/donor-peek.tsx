"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/badge";
import { peekDonor, type DonorPeek } from "./actions";

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; donor: DonorPeek };

/**
 * A donor's name on the Donors list. A plain click opens their details in a panel from the side, so the
 * list, its filters and the scroll position stay where they were (decided 28/10/2026). Ctrl-, Cmd- or
 * middle-click still opens the full page in a new tab, and without JavaScript it is an ordinary link.
 */
export function DonorPeekLink({ charityId, donorId, href, children }: { charityId: string; donorId: string; href: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ kind: "loading" });
  const opener = useRef<HTMLAnchorElement>(null);
  const closer = useRef<HTMLButtonElement>(null);

  const load = () => {
    setState({ kind: "loading" });
    peekDonor(charityId, donorId)
      .then((donor) => setState(donor ? { kind: "ready", donor } : { kind: "error" }))
      .catch(() => setState({ kind: "error" }));
  };

  useEffect(() => {
    if (!open) return;
    closer.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
    opener.current?.focus();
  }

  return (
    <>
      <Link
        ref={opener}
        href={href}
        className="block truncate font-medium text-brand underline"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          setOpen(true);
          load();
        }}
      >
        {children}
      </Link>
      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
          <button type="button" aria-label="Close the donor panel" className="absolute inset-0 cursor-default bg-navy/30" onClick={close} tabIndex={-1} />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Donor details"
            className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface shadow-[-12px_0_40px_rgba(14,27,61,0.18)] sm:rounded-l-[1.5rem]"
            style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            <div className="sticky top-0 flex items-center justify-between gap-3 border-b-2 border-border bg-surface px-5 py-3">
              <p className="text-sm font-semibold text-muted">Donor</p>
              <button ref={closer} type="button" onClick={close} className="inline-flex min-h-11 items-center rounded-full border-2 border-border px-4 text-sm font-semibold text-brand hover:border-brand">
                Close
              </button>
            </div>
            <div className="space-y-4 p-5 text-sm">
              {state.kind === "loading" ? (
                <div aria-live="polite" className="space-y-3">
                  <span className="sr-only">Loading this donor…</span>
                  <div className="h-7 w-2/3 animate-pulse rounded-lg bg-border" />
                  <div className="h-4 w-1/2 animate-pulse rounded-lg bg-border" />
                  <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-control bg-honey-soft" />)}</div>
                </div>
              ) : state.kind === "error" ? (
                <div role="alert" className="space-y-2">
                  <p className="font-semibold text-navy">We couldn&apos;t load this donor.</p>
                  <p className="text-muted">Nothing was changed. Check your connection and try again, or open their full page.</p>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={load} className="pressable min-h-11 rounded-control bg-brand px-4 font-semibold text-brand-contrast">Try again</button>
                    <Link href={href} className="inline-flex min-h-11 items-center font-semibold text-brand underline">Open the full page</Link>
                  </div>
                </div>
              ) : (
                <Peek donor={state.donor} href={href} />
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function Peek({ donor, href }: { donor: DonorPeek; href: string }) {
  return (
    <>
      <div>
        <h2 className="font-display text-2xl font-bold text-indigo [overflow-wrap:anywhere]">{donor.name}</h2>
        {donor.email ? <p className="break-all text-muted">{donor.email}</p> : null}
        {donor.phone ? <p className="text-muted">{donor.phone}</p> : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {donor.groupLabel ? <Badge tone="brand">{donor.groupLabel}</Badge> : null}
          {donor.monthly === "active" ? <Badge tone="success">Gives monthly</Badge> : null}
          {donor.monthly === "paused" ? <Badge>Monthly paused</Badge> : null}
          {donor.tags.map((t) => <Badge key={t}>{t}</Badge>)}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <Fact label="Given in all" value={donor.total} strong />
        <Fact label="Donations" value={String(donor.count)} />
        <Fact label="First gift" value={donor.first} />
        <Fact label="Latest gift" value={donor.last} />
        {donor.largest ? <div className="col-span-2"><Fact label="Largest gift" value={donor.largest} /></div> : null}
      </dl>
      {donor.followUps.length ? (
        <section className="space-y-1.5">
          <h3 className="font-semibold text-navy">Follow-ups</h3>
          <ul className="space-y-1">
            {donor.followUps.map((f, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="min-w-0 [overflow-wrap:anywhere]">{f.what}</span>
                <span className={`shrink-0 tabular-nums ${f.late ? "font-semibold text-warning" : "text-muted"}`}>{f.late ? `was due ${f.due}` : f.due}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {donor.latestNote ? (
        <section className="space-y-1.5">
          <h3 className="font-semibold text-navy">Latest note</h3>
          <p className="line-clamp-4 whitespace-pre-line rounded-control bg-honey-soft p-3 [overflow-wrap:anywhere]">{donor.latestNote}</p>
        </section>
      ) : null}
      {donor.recent.length ? (
        <section className="space-y-1.5">
          <h3 className="font-semibold text-navy">Recent donations</h3>
          <ul className="divide-y divide-border rounded-control border-2 border-border">
            {donor.recent.map((g, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 tabular-nums">
                <span>{g.date}</span>
                <span className="text-muted">{g.status}</span>
                <span className="font-semibold">{g.amount}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Link href={href} className="pressable flex min-h-12 items-center justify-center rounded-control bg-brand px-4 font-semibold text-brand-contrast">
        Open the full page: notes, tags and follow-ups
      </Link>
    </>
  );
}

function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-control bg-honey-soft p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-display text-lg font-bold text-indigo" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}
