"use client";

import { useEffect } from "react";

/**
 * Links to a section of the same page (#how) glide there; everything else scrolls instantly (10/11/2026). Done here
 * rather than with CSS scroll-behavior, which also made going Back open the page too high and then slide down.
 * Respects "reduce motion". Links to another page, new tabs and modified clicks are left to the browser.
 */
export function SmoothSectionLinks() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href*='#']") as HTMLAnchorElement | null;
      // A link that works as a button (the landing page's doors) handles its own press.
      if (!a || (a.target && a.target !== "_self") || a.getAttribute("role") === "button") return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search || !url.hash) return;
      const id = decodeURIComponent(url.hash.slice(1));
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      e.preventDefault();
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      if (location.hash !== url.hash) history.pushState(history.state, "", url.hash);
    };
    // Capture phase: runs before the framework's own link handling, which would jump instantly.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
