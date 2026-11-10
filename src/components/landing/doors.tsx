"use client";

import { Fragment, useCallback, useRef, useSyncExternalStore } from "react";
import { doorFromHash, type Door } from "@/lib/launch-list";

/** Fired when a press changes the address, which history.replaceState doesn't announce by itself. */
const DOOR_EVENT = "givezy:door";
function onHashChange(change: () => void) {
  window.addEventListener("hashchange", change);
  window.addEventListener(DOOR_EVENT, change);
  return () => {
    window.removeEventListener("hashchange", change);
    window.removeEventListener(DOOR_EVENT, change);
  };
}
const noSubscription = () => () => {};

const DOORS: { id: Door; label: string; line: string; tone: string; text: string; ring: string; dot: string }[] = [
  {
    id: "give",
    label: "I give",
    line: "Give to causes you care about, and keep every receipt in one place.",
    tone: "bg-brand",
    text: "text-white",
    ring: "border-white/25",
    dot: "bg-coral",
  },
  {
    id: "charity",
    label: "I run a charity",
    line: "Get found, get given to, and keep the people who give.",
    tone: "bg-honey",
    text: "text-navy",
    ring: "border-brand/25",
    dot: "bg-brand",
  },
];

/**
 * The landing page's two doors (10/11/2026). Choosing one opens its story right underneath, in place; choosing it
 * again closes it. The address keeps #give or #charity, so the page can be shared open on either side. Both stories
 * are in the page from the start (the server renders them), and without script a door is a plain #link that
 * opens its story through :target (see .door-panel in globals.css).
 */
export function Doors({ give, charity }: { give: React.ReactNode; charity: React.ReactNode }) {
  // The open door lives in the address (#give, #charity), so Back, a shared link and a press all agree.
  const hash = useSyncExternalStore(onHashChange, () => window.location.hash, () => "");
  // False on the server and in the first paint, true once the script runs (the :target fallback then stands aside).
  const ready = useSyncExternalStore(noSubscription, () => true, () => false);
  const open = doorFromHash(hash);
  const panels = useRef<Record<Door, HTMLDivElement | null>>({ give: null, charity: null });

  const choose = useCallback((door: Door) => {
    const next = doorFromHash(window.location.hash) === door ? null : door;
    // Replaced, not pushed: opening a door isn't a new page, so Back leaves the site as expected.
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${next ? `#${next}` : ""}`);
    window.dispatchEvent(new Event(DOOR_EVENT));
    if (!next) return;
    // Once the story starts to open, bring its top into view if it starts low on the screen, and move the
    // screen reader there (without a second jump).
    window.setTimeout(() => {
      const el = panels.current[next];
      if (!el) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (el.getBoundingClientRect().top > window.innerHeight * 0.7) el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      el.querySelector<HTMLElement>("[data-panel-title]")?.focus({ preventScroll: true });
    }, 80);
  }, []);

  // One grid holds both doors and both stories. On a phone each story opens right under its own door; from tablet
  // width the doors sit side by side and the open story runs full width underneath them.
  return (
    <div className="doors mx-auto grid max-w-[75rem] gap-4 px-4 sm:px-6 md:grid-cols-2 md:gap-x-6 md:gap-y-0" data-ready={ready ? "" : undefined} data-chosen={open ? "" : undefined}>
      {DOORS.map((d, i) => {
        const isOpen = open === d.id;
        return (
          <Fragment key={d.id}>
            <a
              href={`#${d.id}`}
              role="button"
              aria-expanded={isOpen}
              aria-controls={`${d.id}-story`}
              onClick={(e) => {
                e.preventDefault();
                choose(d.id);
              }}
              onKeyDown={(e) => {
                if (e.key === " ") {
                  e.preventDefault();
                  choose(d.id);
                }
              }}
              className={`door group relative isolate flex min-h-[13.5rem] flex-col justify-between overflow-hidden rounded-[2rem] p-7 shadow-[0_24px_60px_rgba(14,27,61,0.14)] focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-coral sm:min-h-[17rem] sm:p-9 ${i === 0 ? "md:order-1" : "md:order-2"} ${d.tone} ${d.text}`}
            >
              {/* A ring and a dot bleeding off the edge, as on the app's colour blocks: kept in the corners, clear of the words. */}
              <span aria-hidden className={`pointer-events-none absolute -right-12 -top-12 -z-10 h-32 w-32 rounded-full border-[14px] ${d.ring}`} />
              <span aria-hidden className={`pointer-events-none absolute -bottom-5 left-[46%] -z-10 h-10 w-10 rounded-full ${d.dot}`} />
              <span className="pr-14 font-display text-[clamp(2.5rem,6vw,4.25rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">{d.label}</span>
              <span className="flex items-end justify-between gap-6">
                <span className="max-w-[22rem] text-[17px] leading-snug opacity-90 sm:text-[18px]">{d.line}</span>
                <span aria-hidden className={`door-plus flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${d.id === "give" ? "bg-white" : "bg-brand"}`}>
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" strokeWidth="2.6" strokeLinecap="round" className={d.id === "give" ? "stroke-brand" : "stroke-white"}>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </span>
            </a>
            <div
              id={d.id}
              ref={(el) => {
                panels.current[d.id] = el;
              }}
              className="door-panel scroll-mt-6 md:order-3 md:col-span-2"
              data-open={isOpen ? "" : undefined}
              inert={ready && !isOpen ? true : undefined}
            >
              <div id={`${d.id}-story`} role="region" aria-label={d.label}>
                {d.id === "give" ? give : charity}
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
