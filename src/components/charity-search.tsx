"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/**
 * The charities search: results update as you type (after a short pause), with a small spinner while they load.
 * Without JavaScript it is still a plain form that searches on Enter or the button.
 */
export function CharitySearch({ initial, category }: { initial: string; category: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      const q = value.trim();
      if (q) p.set("q", q);
      if (category) p.set("category", category);
      const qs = p.toString();
      startTransition(() => router.replace(qs ? `/charities?${qs}` : "/charities", { scroll: false }));
    }, 300);
    return () => clearTimeout(t);
  }, [value, category, router]);

  return (
    <form role="search" action="/charities" className="flex max-w-[44rem] gap-2">
      {category ? <input type="hidden" name="category" value={category} /> : null}
      <label htmlFor="q" className="sr-only">Search charities</label>
      <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-control border-2 border-border bg-surface px-4 shadow-[0_8px_24px_rgba(23,73,181,0.06)] transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand-soft">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" aria-hidden className="shrink-0 stroke-muted">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
        <input
          id="q"
          name="q"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, 60))}
          placeholder="Name, cause or area"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none focus-visible:outline-none"
        />
        <span aria-hidden className={`h-5 w-5 shrink-0 rounded-full border-[3px] border-brand-soft border-t-brand transition-opacity ${pending ? "animate-spin opacity-100" : "opacity-0"}`} />
      </div>
      <button className="pressable rounded-control bg-brand px-5 py-3 font-bold text-brand-contrast">Search</button>
    </form>
  );
}
