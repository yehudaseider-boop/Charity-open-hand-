"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/**
 * The charities search: results update as you type (after a short pause), with a small spinner while they load.
 * Without JavaScript it is still a plain form that searches on Enter or the button.
 */
export function CharitySearch(props: { initial: string; category: string }) {
  // A new category starts the box over. A new search only does when it came from elsewhere (for example "See all
  // charities"): rebuilding the box on its own results took the keyboard away mid-word and lost what was typed meanwhile.
  return <SearchBox key={props.category} {...props} />;
}

function SearchBox({ initial, category }: { initial: string; category: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [sent, setSent] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    if (initial.trim() !== sent.trim()) {
      setValue(initial);
      setSent(initial);
    }
  }
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
      if (q === initial.trim()) return;
      if (q) p.set("q", q);
      if (category) p.set("category", category);
      const qs = p.toString();
      setSent(q);
      startTransition(() => router.replace(qs ? `/charities?${qs}` : "/charities", { scroll: false }));
    }, 300);
    return () => clearTimeout(t);
  }, [value, category, initial, router]);

  return (
    <form role="search" action="/charities" className="flex max-w-[44rem] gap-2">
      {category ? <input type="hidden" name="category" value={category} /> : null}
      <label htmlFor="q" className="sr-only">Search charities</label>
      <div className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-[1.125rem] border-2 border-border bg-surface px-4 shadow-[0_10px_30px_rgba(23,73,181,0.08)] transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand-soft sm:min-h-16 sm:px-5">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2.4" strokeLinecap="round" aria-hidden className="shrink-0 stroke-brand">
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
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent py-3 text-[17px] outline-none placeholder:text-muted focus-visible:outline-none"
        />
        {pending ? (
          <span role="status" className="flex shrink-0 items-center">
            <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-soft border-t-brand motion-reduce:animate-none" />
            <span className="sr-only">Searching</span>
          </span>
        ) : null}
      </div>
      <button className="pressable min-h-14 shrink-0 rounded-[1.125rem] bg-brand px-4 font-bold text-brand-contrast sm:min-h-16 sm:px-6">Search</button>
    </form>
  );
}
