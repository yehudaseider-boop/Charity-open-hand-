"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Phones: a Give button that stays in reach at the bottom of the screen, but only once the page's own Give
 * button has scrolled out of view, and never over the footer. Laptops keep the give card beside the story.
 */
export function StickyGive({ href, label, watch }: { href: string; label: string; watch: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const target = document.getElementById(watch);
    const footer = document.querySelector("footer");
    if (!target || typeof IntersectionObserver === "undefined") return;
    let targetVisible = true;
    let footerVisible = false;
    const update = () => setShow(!targetVisible && !footerVisible);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === target) targetVisible = e.isIntersecting || e.boundingClientRect.top > 0;
        else footerVisible = e.isIntersecting;
      }
      update();
    });
    io.observe(target);
    if (footer) io.observe(footer);
    return () => io.disconnect();
  }, [watch]);
  return (
    <div
      aria-hidden={!show}
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md transition-transform duration-200 motion-reduce:transition-none lg:hidden ${show ? "translate-y-0" : "pointer-events-none translate-y-full"}`}
    >
      <Link href={href} tabIndex={show ? undefined : -1} aria-label={label} className="pressable block w-full truncate rounded-control bg-coral px-4 py-3.5 text-center text-[17px] font-bold text-navy">
        {label}
      </Link>
    </div>
  );
}
