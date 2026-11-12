"use client";

import { useId, useRef, useState } from "react";

export type LiveTab = { label: string; screen: React.ReactNode };

/**
 * A product window people can click around in (09/11/2026, Yehuda: "make the website interactive"): the menu on the
 * left, or the tabs above on a phone, swap the sample screen inside. Every screen is sample content drawn on the
 * server; this only chooses which one shows. Keyboard: arrow keys move between tabs, as in any tab list.
 */
export function LiveWindow({ tabs, label }: { tabs: LiveTab[]; label: string }) {
  const [active, setActive] = useState(0);
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const phoneButtons = useRef<(HTMLButtonElement | null)[]>([]);

  // Arrow keys, Home and End move between tabs (and End never scrolls the page). The phone's row of tabs slides the
  // chosen one into view.
  const go = (i: number, phone = false) => {
    const next = (i + tabs.length) % tabs.length;
    setActive(next);
    const el = (phone ? phoneButtons : buttons).current[next];
    el?.focus({ preventScroll: true });
    if (phone) el?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  };
  const onPhoneKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(active + 1, true); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(active - 1, true); }
    if (e.key === "Home") { e.preventDefault(); go(0, true); }
    if (e.key === "End") { e.preventDefault(); go(tabs.length - 1, true); }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); go(active + 1); }
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); go(active - 1); }
    if (e.key === "Home") { e.preventDefault(); go(0); }
    if (e.key === "End") { e.preventDefault(); go(tabs.length - 1); }
  };
  const tab = (t: LiveTab, i: number, phone: boolean) => (
    <button
      key={t.label}
      ref={(el) => { (phone ? phoneButtons : buttons).current[i] = el; }}
      type="button"
      role="tab"
      id={`${id}-${phone ? "p" : "t"}${i}`}
      aria-selected={i === active}
      aria-controls={`${id}-panel`}
      tabIndex={i === active ? 0 : -1}
      onClick={(e) => {
        setActive(i);
        // Phone: a tab half off the edge slides fully into view, without moving the page.
        if (phone) e.currentTarget.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
      }}
      className={
        phone
          ? `inline-flex min-h-11 shrink-0 items-center rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${i === active ? "bg-brand text-white" : "bg-honey-soft text-navy"}`
          : `w-full rounded-lg px-3 py-2 text-left transition-colors ${i === active ? "bg-brand-soft font-semibold text-brand" : "text-muted hover:bg-honey-soft hover:text-navy"}`
      }
    >
      {t.label}
    </button>
  );

  return (
    <div className="overflow-hidden rounded-[1.25rem] border-[1.5px] border-border bg-white shadow-[0_40px_80px_rgba(14,27,61,0.12)]">
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-3" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b6b]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#ffc94d]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#4cd07d]" />
        <span className="ml-4 h-6 flex-1 rounded-full bg-honey-soft" />
      </div>
      {/* Phone: the tabs sit above the screen and scroll sideways. */}
      <div role="tablist" aria-label={label} onKeyDown={onPhoneKey} className="no-scrollbar flex gap-2 overflow-x-auto border-b border-border px-4 py-3 sm:hidden">
        {tabs.map((t, i) => tab(t, i, true))}
      </div>
      <div className="flex min-h-[21rem]">
        <div className="hidden w-44 shrink-0 flex-col gap-1 border-r border-border p-4 text-sm sm:flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={97} height={32} className="mb-3 ml-3 h-6 w-auto" />
          <div role="tablist" aria-label={label} aria-orientation="vertical" onKeyDown={onKey} className="flex flex-col gap-1">
            {tabs.map((t, i) => tab(t, i, false))}
          </div>
        </div>
        <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-t${active}`} className="min-w-0 flex-1 p-5 sm:p-6">
          <div key={active} className="screen-in">{tabs[active].screen}</div>
        </div>
      </div>
    </div>
  );
}
