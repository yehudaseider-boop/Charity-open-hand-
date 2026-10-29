"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type MenuItem = { href: string; label: string };

/**
 * The phone's menu (30/10/2026): every part of the site one tap away, so no page is a dead end. On a
 * phone the header only has room for the logo, this button and Sign in; the donor side (Home, Find a
 * charity) and the charity side (For charities) both live here. Closes on a choice, Escape or a tap outside.
 */
export function MobileMenu({ items }: { items: MenuItem[] }) {
  const path = usePathname();
  // The menu is open on the page it was opened on, so moving to a new page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    const onDown = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpenOn(null);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const here = (href: string) => path === href || (href !== "/" && path.startsWith(`${href}/`)) || (href === "/charities" && path.startsWith("/c/"));

  return (
    <div ref={box} className="relative sm:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="phone-menu"
        onClick={() => setOpenOn(open ? null : path)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold text-navy transition-colors hover:bg-honey-soft"
      >
        <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
        Menu
      </button>
      {open ? (
        <nav id="phone-menu" aria-label="Menu" className="absolute right-0 top-full z-50 mt-2 w-60 rounded-[1.125rem] border-2 border-border bg-surface p-2 shadow-xl shadow-navy/10">
          <ul>
            {items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  aria-current={here(i.href) ? "page" : undefined}
                  className={`flex min-h-11 items-center rounded-control px-3 font-semibold transition-colors hover:bg-honey-soft ${here(i.href) ? "bg-honey-soft text-brand" : "text-navy"}`}
                >
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
