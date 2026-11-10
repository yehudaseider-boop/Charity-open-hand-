"use client";

import { useEffect, useRef } from "react";

/**
 * A section that glides up into place the first time it scrolls into view (09/11/2026). Works on iPhones too, unlike
 * the CSS scroll timeline. Nothing is ever hidden before the page is ready: only a section that starts below the
 * screen waits, so without script, with "reduce motion", in print, or already on screen, it simply shows.
 */
export function Reveal({ as = "div", children, ...rest }: { as?: "div" | "section" } & React.HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    el.dataset.reveal = "wait";
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.dataset.reveal = "in";
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const Tag = as;
  return <Tag ref={ref as React.Ref<HTMLDivElement>} {...rest}>{children}</Tag>;
}
