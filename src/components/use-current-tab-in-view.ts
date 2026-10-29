"use client";

import { useEffect, useRef } from "react";

/**
 * For a row of tabs that scrolls sideways on a phone: brings the current tab (aria-current) into view,
 * centred, whenever the page changes, so you can always see where you are (30/10/2026). Scrolls only the
 * row, never the page.
 */
export function useCurrentTabInView<T extends HTMLElement>(key: string) {
  const row = useRef<T>(null);
  useEffect(() => {
    const el = row.current;
    const current = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !current) return;
    const [a, b] = [el.getBoundingClientRect(), current.getBoundingClientRect()];
    el.scrollLeft += b.left - a.left - (a.width - b.width) / 2;
  }, [key]);
  return row;
}
