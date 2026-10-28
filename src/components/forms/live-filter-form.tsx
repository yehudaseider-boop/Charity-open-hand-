"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

/** How long typing pauses before the list updates: fast enough to feel instant, slow enough not to search on every key. */
const TYPING_PAUSE_MS = 350;

/**
 * A filter form that updates the list as you go (decided 28/10/2026): typing in the search box narrows the
 * list after a short pause, and a changed menu applies at once, with no Search button needed and no full
 * reload. The page itself still does the filtering, so the button and a plain form keep working without
 * JavaScript. Date boxes apply only once they hold a whole dd/mm/yyyy (or are cleared), never half-typed.
 */
export function LiveFilterForm({ action, className, children }: { action: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const apply = () => {
    if (!form.current) return;
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(form.current)) {
      if (typeof v === "string" && v.trim() !== "") params.set(k, v.trim());
    }
    const query = params.toString();
    // Only lists on this page: a stray form elsewhere never navigates away.
    if (action !== pathname) return;
    startTransition(() => router.replace(query ? `${action}?${query}` : action, { scroll: false }));
  };

  const onInput = (e: React.FormEvent<HTMLFormElement>) => {
    const el = e.target as HTMLInputElement;
    if (el.tagName !== "INPUT" || el.type === "hidden") return;
    const isDate = el.name === "from" || el.name === "to";
    if (isDate && el.value !== "" && el.value.length < 10) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(apply, TYPING_PAUSE_MS);
  };

  const onChange = (e: React.FormEvent<HTMLFormElement>) => {
    if ((e.target as HTMLElement).tagName === "SELECT") apply();
  };

  return (
    <>
    <form
      ref={form}
      action={action}
      className={className}
      onInput={onInput}
      onChange={onChange}
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        apply();
      }}
    >
      {children}
    </form>
    <p aria-live="polite" className="-mt-2 min-h-4 text-xs text-muted">{pending ? "Updating the list…" : ""}</p>
    </>
  );
}
