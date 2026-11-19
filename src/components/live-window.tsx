"use client";

import { useId, useRef, useState } from "react";

export type LiveTab = { label: string; screen: React.ReactNode };

/**
 * A product window people can click around in (09/11/2026, Yehuda: "make the website interactive"): the menu on the
 * left, or on a phone the tabs under a phone frame (19/11/2026), swap the sample screen inside. Every screen is sample content drawn on the
 * server; this only chooses which one shows. Keyboard: arrow keys move between tabs, as in any tab list.
 */
/**
 * `menuFrom`: from which width the window with its menu shows ("lg" keeps the phone frame on tablets).
 * `phoneGround`: the phone screen's background. "soft" for screens that are pictures of the dashboard (they bring
 * their own pale ground and white cards); "white" for screens drawn in the page, whose cards are pale.
 */
export function LiveWindow({ tabs, label, menuFrom = "sm", phoneGround = "white", onBlue = false }: { tabs: LiveTab[]; label: string; menuFrom?: "sm" | "lg"; phoneGround?: "soft" | "white"; /** The section behind is logo blue: the phone's tabs turn the other way round (white when chosen), like the buttons in the blue header. */ onBlue?: boolean }) {
  const [active, setActive] = useState(0);
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const phoneButtons = useRef<(HTMLButtonElement | null)[]>([]);

  // Arrow keys, Home and End move between tabs (and End never scrolls the page).
  const go = (i: number, phone = false) => {
    const next = (i + tabs.length) % tabs.length;
    setActive(next);
    const el = (phone ? phoneButtons : buttons).current[next];
    el?.focus({ preventScroll: true });
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
      aria-controls={phone ? `${id}-panel-p` : `${id}-panel`}
      tabIndex={i === active ? 0 : -1}
      onClick={() => setActive(i)}
      className={
        phone
          ? `inline-flex min-h-11 shrink-0 items-center rounded-full border-2 px-4 py-2 text-[14px] font-semibold transition-colors ${onBlue ? (i === active ? "border-white bg-white text-brand" : "border-white/40 bg-white/10 text-white") : i === active ? "border-brand bg-brand text-white" : "border-border bg-white text-navy"}`
          : `w-full rounded-lg px-3 py-2 text-left transition-colors ${i === active ? "bg-brand-soft font-semibold text-brand" : "text-muted hover:bg-honey-soft hover:text-navy"}`
      }
    >
      {t.label}
    </button>
  );

  const small = menuFrom === "lg" ? "lg:hidden" : "sm:hidden";
  const large = menuFrom === "lg" ? "hidden lg:block" : "hidden sm:block";
  const screen = <div key={active} className="screen-in">{tabs[active].screen}</div>;

  return (
    <div>
      {/* Phone (19/11/2026, Yehuda chose "a real phone, whole screens"): the screen sits in a phone, scrolls like one,
          and the tabs are below it. Before, a whole browser window was squeezed in and cut off mid-card. */}
      <div className={`mx-auto w-full max-w-[22rem] ${small}`}>
        <div className="rounded-[2.75rem] bg-navy p-2.5 shadow-[0_40px_80px_rgba(14,27,61,0.35)]">
          <div className={`relative overflow-hidden rounded-[2.25rem] ${phoneGround === "soft" ? "phone-ground-soft" : "bg-white"}`}>
            <span aria-hidden className="absolute left-1/2 top-2 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-navy" />
            {/* Keyed by the tab, so each screen opens at its top (not where the last one was scrolled to). No
                overscroll-contain: at the screen's top or bottom the swipe carries on to the page, and the frame is
                never taller than 70% of the phone, so some page always shows to scroll by. */}
            <div key={active} id={`${id}-panel-p`} role="tabpanel" aria-labelledby={`${id}-p${active}`} tabIndex={0} className={`phone-screen h-[min(34rem,70svh)] overflow-y-auto pb-4 pt-10 ${phoneGround === "soft" ? "" : "px-4"}`}>
              {screen}
            </div>
            {/* The screen scrolls: its last visible card fades out softly, so it reads as "more below", not as cut off. */}
            <span aria-hidden className={`pointer-events-none absolute inset-x-0 bottom-0 h-12 ${phoneGround === "soft" ? "phone-fade-soft" : "bg-gradient-to-t from-white to-transparent"}`} />
          </div>
        </div>
        <div role="tablist" aria-label={label} onKeyDown={onPhoneKey} className="mt-5 flex flex-wrap justify-center gap-2">
          {tabs.map((t, i) => tab(t, i, true))}
        </div>
      </div>

      {/* Laptop and up: the window, with its menu on the left. */}
      <div className={`overflow-hidden rounded-[1.25rem] border-[1.5px] border-border bg-white shadow-[0_40px_80px_rgba(14,27,61,0.12)] ${large}`}>
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-3" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b6b]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffc94d]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#4cd07d]" />
          <span className="ml-4 h-6 flex-1 rounded-full bg-honey-soft" />
        </div>
        <div className="flex min-h-[21rem]">
          <div className="flex w-44 shrink-0 flex-col gap-1 border-r border-border p-4 text-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-400.png" alt="" width={97} height={32} className="mb-3 ml-3 h-6 w-auto" />
            <div role="tablist" aria-label={label} aria-orientation="vertical" onKeyDown={onKey} className="flex flex-col gap-1">
              {tabs.map((t, i) => tab(t, i, false))}
            </div>
          </div>
          <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-t${active}`} className="min-w-0 flex-1 p-5 sm:p-6">
            {screen}
          </div>
        </div>
      </div>
    </div>
  );
}
