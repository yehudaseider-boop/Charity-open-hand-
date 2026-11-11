"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { MobileMenu } from "@/components/mobile-menu";
import { NavLink } from "@/components/nav-link";
import { signInFingerprint, type HeaderViewer } from "@/lib/header-viewer";

/**
 * The header's links, with Sign in or Account and the work areas for the person looking. Public pages are served
 * from cache, so the page itself never knows who is looking: it arrives with Sign in, and the browser asks
 * /api/viewer only when there is a sign-in cookie (09/11/2026). The answer is kept for this tab, so moving
 * around the site shows Account straight away and asks again only when the sign-in changes.
 */

const KEY = "gz_viewer";
type Kept = { fp: string; viewer: HeaderViewer };

let kept: Kept | null | undefined;
const listeners = new Set<() => void>();

function load(): Kept | null {
  if (kept !== undefined) return kept;
  try {
    kept = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Kept | null;
  } catch {
    kept = null;
  }
  return kept;
}

function keep(next: Kept | null) {
  kept = next;
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Private browsing: kept for this page only.
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The viewer for the current sign-in, or null (shown as Sign in) when nobody is signed in or we don't know yet. */
function current(): HeaderViewer | null {
  const k = load();
  const fp = signInFingerprint(document.cookie);
  return k && fp && k.fp === fp ? k.viewer : null;
}

let asking: string | null = null;

/** Checks the sign-in after each page change: nothing to ask when there's no cookie or nothing changed. */
async function refresh() {
  const fp = signInFingerprint(document.cookie);
  if (!fp) {
    if (load()) keep(null);
    return;
  }
  if (load()?.fp === fp || asking === fp) return;
  asking = fp;
  try {
    const res = await fetch("/api/viewer", { cache: "no-store", credentials: "same-origin" });
    if (res.ok) keep({ fp, viewer: (await res.json()) as HeaderViewer });
  } catch {
    // Offline or the server didn't answer: the header keeps showing Sign in, and asks again on the next page.
  } finally {
    asking = null;
  }
}

export function HeaderNav() {
  const path = usePathname();
  // The server (and the cache) always draw the signed-out header; the browser fills in who is looking.
  const viewer = useSyncExternalStore(subscribe, current, () => null);
  useEffect(() => {
    void refresh();
  }, [path]);

  const dashboards = viewer?.dashboards ?? [];
  const signedIn = Boolean(viewer?.signedIn);
  return (
    <nav aria-label="Main" className="flex items-center gap-1 whitespace-nowrap text-[15px] sm:gap-2">
      {/* Phones: one Menu button holds every part of the site, so no page is a dead end (30/10/2026). */}
      <MobileMenu
        items={[
          { href: "/", label: "Home" },
          { href: "/charities", label: "Find a charity" },
          { href: "/for-donors", label: "For donors" },
          { href: "/for-charities", label: "For charities" },
          ...dashboards.map((d) => ({ href: d.href, label: d.label })),
          ...(signedIn ? [{ href: "/account", label: "Account" }] : []),
        ]}
      />
      <NavLink href="/charities" className="max-sm:hidden">Charities</NavLink>
      <NavLink href="/for-donors" className="max-md:hidden">For donors</NavLink>
      <NavLink href="/for-charities" className="max-sm:hidden">For charities</NavLink>
      {/* A charity admin or Givezy staff can always get back to their area from any public page. */}
      {dashboards.map((d) => (
        <NavLink key={d.href} href={d.href} className="max-sm:hidden">{d.label}</NavLink>
      ))}
      {signedIn ? (
        <NavLink href="/account" className="max-sm:hidden">Account</NavLink>
      ) : (
        <Link href="/login" className="ml-1 inline-flex min-h-11 items-center rounded-full bg-brand px-4 font-semibold text-brand-contrast transition-colors hover:bg-navy">
          Sign in
        </Link>
      )}
    </nav>
  );
}
