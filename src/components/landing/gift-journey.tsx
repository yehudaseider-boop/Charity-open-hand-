"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/marketing";
import { GivePhone, NewGift, Receipt, storyCard } from "./gift-story";

/**
 * One gift, start to finish (19/11/2026, Yehuda: "make this live website fricken insane", a live giving story, for
 * charities). As the visitor scrolls, the screen holds while one R250 gift travels: the donor taps Give, a gift flies
 * to the charity's dashboard and the month's total ticks up, the thank-you email lands, then the s18A receipt stamps
 * down. Every name and amount is the dashboard demo's made-up sample data.
 *
 * Nothing depends on the animation: before the script runs, without it, and with "reduce motion", the four steps
 * simply show one under the other, like the hero.
 */

const STEPS = [
  { title: "A donor taps Give", text: "On your Givezy page or in the Givezy app, once or every month." },
  { title: "It's on your dashboard", text: "The moment the payment provider confirms it: who gave, how much and where it came from." },
  { title: "They're thanked", text: "A thank-you email goes out straight away, with your own note in it." },
  { title: "Tax time, sorted", text: "The gift is on the donor's s18A receipt, which you check before it goes out." },
] as const;

/** The demo's month so far, before and after this gift (sample data). */
const MONTH_BEFORE = 9_210;
const GIFT = 250;

const clamp = (n: number) => Math.min(1, Math.max(0, n));
/** How far through [a, b] the scroll is, from 0 to 1. */
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
/** Fast out, soft landing. */
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
/** A little past the mark, then back: for the receipt's stamp. */
const back = (t: number) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);
const rand = (n: number) => `R${Math.round(n).toLocaleString("en-ZA").replace(/[\s ,]/g, " ")}`;

function MonthCard({ total, count, glow }: { total: number; count: number; glow: number }) {
  return (
    <div className="relative overflow-hidden rounded-[1.25rem] bg-brand p-5 text-white shadow-[0_24px_60px_rgba(6,22,70,0.35)]">
      <span aria-hidden className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[#8b84e0]" />
      <span aria-hidden className="absolute inset-0 rounded-[1.25rem] ring-4 ring-coral" style={{ opacity: glow }} />
      <p className="relative text-[13px] font-semibold text-white/85">This month so far</p>
      <p className="relative mt-1 font-display text-[2.25rem] font-extrabold leading-none tracking-[-0.02em] tabular-nums">{rand(total)}</p>
      <p className="relative mt-2 text-[13px] text-white/85">{count} donations</p>
    </div>
  );
}

/** The four steps laid out still: the page before script, without it, and with reduce motion. */
function Still() {
  return (
    <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((s, i) => (
        <li key={s.title} className="flex flex-col gap-4">
          <StepLabel n={i + 1} title={s.title} text={s.text} on />
          <div className="max-w-[17rem]">
            {i === 0 ? <GivePhone /> : i === 1 ? <NewGift /> : i === 2 ? <EmailCard /> : <Receipt />}
          </div>
        </li>
      ))}
    </ol>
  );
}

function EmailCard() {
  return (
    <div className={`${storyCard} overflow-hidden p-1.5`}>
      <Image src="/home/email-v6.webp" width={1584} height={1347} alt="" unoptimized className="block h-auto w-full rounded-[1rem]" />
    </div>
  );
}

function StepLabel({ n, title, text, on }: { n: number; title: string; text: string; on: boolean }) {
  return (
    <div className={`flex gap-4 transition-opacity duration-300 ${on ? "opacity-100" : "opacity-35"}`}>
      <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-[15px] font-extrabold transition-colors duration-300 ${on ? "bg-coral text-navy" : "bg-brand/10 text-brand"}`}>{n}</span>
      <span className="flex flex-col gap-1">
        <span className="font-display text-[clamp(1.25rem,2vw,1.625rem)] font-extrabold leading-tight tracking-[-0.01em]">{title}</span>
        <span className="text-[16px] leading-relaxed text-muted">{text}</span>
      </span>
    </div>
  );
}

export function GiftJourney() {
  const outer = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const [wide, setWide] = useState(false);
  const [p, setP] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onMq = () => setWide(mq.matches);
    mq.addEventListener("change", onMq);
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = outer.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const run = r.height - window.innerHeight;
      setP(run > 0 ? clamp(-r.top / run) : 1);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    // Switch to the moving story on the next frame (not inside the effect itself), already measured.
    const start = requestAnimationFrame(() => {
      onMq();
      setLive(true);
      measure();
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      mq.removeEventListener("change", onMq);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(start);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  if (!live) return <Still />;

  // Four beats across the scroll, with a short hold at the end so the receipt can be read.
  const s1 = seg(p, 0.02, 0.22);
  const s2 = seg(p, 0.24, 0.46);
  const s3 = seg(p, 0.5, 0.68);
  const s4 = seg(p, 0.72, 0.88);
  const step = p < 0.24 ? 0 : p < 0.5 ? 1 : p < 0.72 ? 2 : 3;

  const press = seg(s1, 0.55, 0.8) - seg(s1, 0.8, 1); // the button goes down, then up
  const ripple = seg(s1, 0.7, 1);
  const fly = ease(seg(s2, 0, 0.45));
  const landed = seg(s2, 0.4, 0.6);
  const total = MONTH_BEFORE + GIFT * ease(seg(s2, 0.45, 0.85));
  const newGift = ease(seg(s2, 0.6, 1));
  const email = ease(s3);
  const stamp = s4 > 0 ? back(ease(s4)) : 0;

  // On a phone the donor's phone steps aside to a corner once the gift has left it.
  const phoneAside = wide ? 0 : ease(seg(s2, 0, 0.35));

  // Each card that arrives pushes the ones before it back a little, like a deck.
  const behind = (later: number) => `translateY(${-later * 26}px) scale(${1 - later * 0.06})`;
  /** Cards pushed back fade and soften, so the one in front reads cleanly. */
  const dim = (later: number) => ({ opacity: 1 - Math.min(1, later) * 0.8, filter: later > 0.05 ? `blur(${Math.min(1, later) * 2}px)` : undefined });
  const back1 = email + (s4 > 0 ? ease(s4) : 0);
  const back2 = s4 > 0 ? ease(s4) : 0;

  return (
    <div ref={outer} className="relative" style={{ height: "420svh" }}>
      <div className="sticky top-16 flex h-[calc(100svh-4rem)] flex-col justify-center sm:top-[4.5rem] sm:h-[calc(100svh-4.5rem)]">
        <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-12">
          {/* The words: all four steps on a laptop, the current one on a phone. */}
          <div aria-live="polite" className="flex flex-col gap-5 lg:gap-7">
            {wide ? (
              STEPS.map((s, i) => <StepLabel key={s.title} n={i + 1} title={s.title} text={s.text} on={i === step} />)
            ) : (
              <StepLabel n={step + 1} title={STEPS[step].title} text={STEPS[step].text} on />
            )}
            <div aria-hidden className="mt-1 flex gap-2">
              {STEPS.map((s, i) => (
                <span key={s.title} className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand/12">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${[s1, s2, s3, s4][i] * 100}%` }} />
                </span>
              ))}
            </div>
          </div>

          {/* The stage. */}
          <div aria-hidden className="relative mx-auto h-[min(30rem,58svh)] w-full max-w-[38rem] lg:h-[36rem] lg:max-w-[42rem]">
            <span className="absolute -right-6 top-6 h-56 w-56 rounded-full bg-peach" />
            <span className="absolute -left-4 bottom-2 h-32 w-32 rounded-full border-[22px] border-honey" />

            {/* The donor's phone. */}
            <div
              className="absolute left-0 top-0 w-[15rem] origin-top-left will-change-transform lg:top-6 lg:w-[16.5rem]"
              style={{
                transform: wide ? "none" : `translate(${-phoneAside * 0.5}rem, ${-phoneAside * 0.5}rem) scale(${1 - phoneAside * 0.55})`,
                opacity: wide ? 1 - back2 * 0.35 : (1 - phoneAside * 0.15) * (1 - email),
                left: wide ? 0 : `calc(50% - ${(1 - phoneAside) * 7.5}rem)`,
              }}
            >
              <div style={{ transform: `scale(${1 - press * 0.03})` }}>
                <GivePhone />
              </div>
              {/* The tap: a ring spreading from the Give button. */}
              <span
                className="absolute bottom-7 left-1/2 h-16 w-16 -translate-x-1/2 rounded-full border-4 border-coral"
                style={{ opacity: ripple > 0 && ripple < 1 ? 1 - ripple : 0, transform: `translateX(-50%) scale(${0.4 + ripple * 2.2})` }}
              />
            </div>

            {/* The gift in flight: from the Give button to the dashboard. */}
            {s2 > 0 && landed < 1 ? (
              <span
                className="absolute z-30 flex h-11 w-11 items-center justify-center rounded-full bg-coral font-display text-[13px] font-extrabold text-navy shadow-[0_10px_30px_rgba(255,138,61,0.55)]"
                style={{
                  left: wide ? `calc(${8 + fly * 28}rem)` : `calc(50% + ${-1.4 + fly * 1.4}rem)`,
                  top: wide ? `calc(${29 - fly * 24}rem - ${Math.sin(fly * Math.PI) * 5}rem)` : `calc(${22 - fly * 15}rem - ${Math.sin(fly * Math.PI) * 4}rem)`,
                  transform: `scale(${1 - landed * 0.6})`,
                  opacity: 1 - landed,
                }}
              >
                R250
              </span>
            ) : null}

            {/* The charity's side: a deck of cards, each new one on top. */}
            <div className="absolute right-0 top-[38%] w-full max-w-[21rem] lg:top-4 lg:w-[23rem] lg:max-w-[23rem] max-lg:left-1/2 max-lg:-translate-x-1/2">
              <div className="relative">
                <div
                  className="relative z-10 flex flex-col gap-3 will-change-transform"
                  style={{ ...dim(back1), opacity: ease(seg(s2, 0, 0.3)) * dim(back1).opacity, transform: `${behind(back1)} translateY(${(1 - ease(seg(s2, 0, 0.3))) * 24}px)` }}
                >
                  <MonthCard total={total} count={total >= MONTH_BEFORE + GIFT ? 22 : 21} glow={landed > 0 && landed < 1 ? 1 - Math.abs(landed * 2 - 1) : 0} />
                  <div style={{ opacity: newGift, transform: `translateY(${(1 - newGift) * -16}px)` }}>
                    <NewGift />
                  </div>
                </div>

                <div
                  className="absolute inset-x-0 top-6 z-20 will-change-transform"
                  style={{ ...dim(back2), opacity: email * dim(back2).opacity, transform: `${behind(back2)} translateX(${(1 - email) * 60}px) rotate(${(1 - email) * 4}deg)` }}
                >
                  <EmailCard />
                </div>

                <div
                  className="absolute inset-x-6 top-24 z-30 will-change-transform"
                  style={{ opacity: s4 > 0 ? Math.min(1, s4 * 3) : 0, transform: `scale(${s4 > 0 ? 1.35 - 0.35 * stamp : 1.35}) rotate(${s4 > 0 ? -6 + 6 * stamp : -6}deg)` }}
                >
                  <Receipt />
                  <span
                    className="absolute -right-3 -top-3 flex h-11 w-11 items-center justify-center rounded-full bg-sage shadow-[0_8px_20px_rgba(46,157,107,0.45)]"
                    style={{ transform: `scale(${seg(s4, 0.6, 1)})` }}
                  >
                    <Icon name="check" className="stroke-white" size={20} />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
