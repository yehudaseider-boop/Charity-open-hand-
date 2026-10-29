"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const NOW = "gz_route_now";
const BEFORE = "gz_route_before";

/**
 * Remembers the page someone was on before this one (its path only), for "← Donations"-style links that
 * go back to a list as it was left (30/10/2026). The browser's own referrer can't be used: it only
 * changes on a full page load, so after moving around inside the site it points at a stale page.
 */
export function RouteMemory() {
  const path = usePathname();
  useEffect(() => {
    try {
      const now = sessionStorage.getItem(NOW);
      if (now !== path) {
        if (now) sessionStorage.setItem(BEFORE, now);
        sessionStorage.setItem(NOW, path);
      }
    } catch {
      // Storage blocked (private browsing and the like): back links fall back to plain links.
    }
  }, [path]);
  return null;
}

/** The path of the page before this one, or null when it isn't known. */
export function previousPath(): string | null {
  try {
    return sessionStorage.getItem(BEFORE);
  } catch {
    return null;
  }
}
