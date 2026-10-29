import Link from "next/link";

/**
 * Building blocks for the public marketing pages (home and For charities), direction B (preview, 29/10/2026),
 * laid out after the "Deupload" landing pages Yehuda liked: a centred hero over a product window with floating cards
 * and scattered dots, three solid blue cards, two pastel cards and a wide lilac card, a soft section with stacked
 * feature cards, a coloured band with cards hanging over its edge, icon steps on a dotted line, and a closing
 * "Ready to get started?" pair. Pictures are Givezy's own screens (samples), never stock illustrations.
 */

const H2 = "font-display text-[clamp(1.875rem,3.2vw,2.75rem)] font-bold leading-[1.12] text-balance";
export const h2Class = H2;

/** One or two words of a headline in Givezy blue. */
export function Key({ children }: { children: React.ReactNode }) {
  return <span className="text-brand">{children}</span>;
}

export const icons = {
  shield: "M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3zM9 12l2 2 4-4",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
  heart: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
  bank: "M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  repeat: "M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  building: "M4 21V5l8-3 8 3v16M9 21v-4h6v4M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  download: "M12 3v12M7 10l5 5 5-5M4 21h16",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  code: "M8 8l-4 4 4 4M16 8l4 4-4 4M14 4l-4 16",
  mail: "M4 5h16v14H4zM4 7l8 6 8-6",
  check: "M5 12l5 5L20 7",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2",
};
export type IconName = keyof typeof icons;

export function Icon({ name, className = "stroke-brand", size = 22 }: { name: IconName; className?: string; size?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={icons[name]} />
    </svg>
  );
}

/** A round icon: white on blue cards, blue on light ones. */
export function IconCircle({ name, tone = "white" }: { name: IconName; tone?: "white" | "blue" | "soft" | "sage" | "peach" }) {
  const bg = { white: "bg-white", blue: "bg-brand", soft: "bg-brand-soft", sage: "bg-success-soft", peach: "bg-peach" }[tone];
  const stroke = { white: "stroke-brand", blue: "stroke-white", soft: "stroke-brand", sage: "stroke-success", peach: "stroke-[#b4501a]" }[tone];
  return (
    <span aria-hidden className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${bg}`}>
      <Icon name={name} className={stroke} />
    </span>
  );
}

function Arrow() {
  return <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="stroke-current"><path d="M9 6l6 6-6 6" /></svg>;
}

/** Centred section heading with a short line under it. */
export function SectionHead({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="reveal mx-auto flex max-w-[44rem] flex-col items-center gap-3 text-center">
      <h2 className={H2}>{title}</h2>
      {children ? <p className="text-[17px] leading-relaxed text-muted">{children}</p> : null}
    </div>
  );
}

/**
 * Bubbles: soft circles and rings in Givezy blue, orange and lavender, placed absolutely by the caller.
 * Decoration only (hidden from screen readers); orange only ever as a shape, never as text.
 */
export type BubbleSpec = { c: string; anim?: "bob" | "bob-slow" };
export function Bubbles({ items, className = "" }: { items: (string | BubbleSpec)[]; className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 ${className}`}>
      {items.map((it, i) => {
        const b = typeof it === "string" ? { c: it } : it;
        return <span key={i} className={`absolute rounded-full ${b.c} ${b.anim ?? ""}`} />;
      })}
    </div>
  );
}

/** Scattered dots, rings and small shapes around the hero picture (decoration only). */
export function Confetti() {
  return (
    <>
      <Bubbles
        className="hidden md:block"
        items={[
          { c: "-left-6 top-[8%] h-20 w-20 bg-coral", anim: "bob" },
          { c: "left-[6%] top-[52%] h-8 w-8 border-[3px] border-brand" },
          { c: "left-[2%] top-[78%] h-4 w-4 bg-brand", anim: "bob-slow" },
          { c: "left-[16%] -top-[6%] h-5 w-5 bg-honey", anim: "bob-slow" },
          { c: "-right-4 top-[30%] h-28 w-28 bg-brand", anim: "bob-slow" },
          { c: "right-[4%] top-[6%] h-6 w-6 border-[3px] border-coral", anim: "bob" },
          { c: "right-[2%] top-[72%] h-12 w-12 bg-honey", anim: "bob" },
          { c: "right-[18%] -bottom-[4%] h-4 w-4 bg-coral" },
          { c: "left-[40%] -bottom-[6%] h-6 w-6 border-[3px] border-honey" },
          { c: "right-[34%] -top-[5%] h-3 w-3 bg-brand" },
        ]}
      />
    </>
  );
}

/** A browser-style window with a sidebar, for the hero picture. */
export function AppWindow({ nav, active, children }: { nav: string[]; active: number; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[1.25rem] border-[1.5px] border-border bg-white shadow-[0_40px_80px_rgba(14,27,61,0.12)]">
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-3" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b6b]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#ffc94d]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#4cd07d]" />
        <span className="ml-4 h-6 flex-1 rounded-full bg-honey-soft" />
      </div>
      <div className="flex min-h-[20rem]">
        <ul className="hidden w-44 shrink-0 flex-col gap-1 border-r border-border p-4 text-sm sm:flex" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <li className="mb-3"><img src="/logo.png" alt="" width={97} height={32} className="h-6 w-auto" /></li>
          {nav.map((n, i) => (
            <li key={n} className={`rounded-lg px-3 py-2 ${i === active ? "bg-brand-soft font-semibold text-brand" : "text-muted"}`}>{n}</li>
          ))}
        </ul>
        <div className="min-w-0 flex-1 p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

/** A small card that floats over the edge of the hero window. */
export function Floating({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <div className={`absolute z-10 hidden rounded-[1.125rem] border-[1.5px] border-honey bg-white p-4 text-left shadow-[0_24px_48px_rgba(23,73,181,0.18)] md:block ${className}`}>
      {children}
    </div>
  );
}

/** Three solid blue cards, each with a white round icon and a link. */
export function BlueCards({ items }: { items: { icon: IconName; title: string; body: string; href: string; link: string }[] }) {
  return (
    <ul className="reveal grid gap-5 md:grid-cols-3">
      {items.map((it) => (
        <li key={it.title} className="lift relative flex flex-col items-start gap-4 overflow-hidden rounded-[1.25rem] bg-brand p-7 text-white">
          <Bubbles items={["-right-10 -top-10 h-32 w-32 bg-white/10", "right-6 top-20 h-4 w-4 bg-coral", "-bottom-8 right-10 h-20 w-20 border-[10px] border-honey/40"]} />
          <IconCircle name={it.icon} />
          <h3 className="relative mt-2 font-display text-[1.375rem] font-bold leading-tight text-white!">{it.title}</h3>
          <p className="relative text-[15px] leading-relaxed text-honey-soft">{it.body}</p>
          <Link href={it.href} className="relative mt-auto inline-flex items-center gap-1 pt-2 text-[15px] font-bold text-white hover:underline">{it.link}<Arrow /></Link>
        </li>
      ))}
    </ul>
  );
}

/** A tall pastel card: title and line centred, then a picture. */
export function PastelCard({ tone, title, body, children }: { tone: "peach" | "lilac" | "sky"; title: string; body: string; children: React.ReactNode }) {
  const bg = { peach: "bg-peach", lilac: "bg-honey-soft", sky: "bg-brand-soft" }[tone];
  return (
    <div className={`lift reveal relative flex flex-col items-center gap-3 overflow-hidden rounded-[1.25rem] px-6 pt-9 text-center sm:px-10 ${bg}`}>
      <Bubbles items={tone === "peach"
        ? ["-left-8 -top-8 h-24 w-24 bg-coral/25", "right-8 top-10 h-5 w-5 bg-coral", "-right-6 bottom-16 h-16 w-16 border-[6px] border-coral/40"]
        : ["-right-8 -top-8 h-24 w-24 bg-brand/15", "left-8 top-12 h-5 w-5 bg-brand", "-left-6 bottom-16 h-16 w-16 border-[6px] border-honey"]} />
      <h3 className="relative font-display text-[1.625rem] font-bold text-brand">{title}</h3>
      <p className="relative max-w-[24rem] text-[15px] leading-relaxed text-muted">{body}</p>
      <div className="relative mt-6 w-full max-w-[22rem] text-left">{children}</div>
    </div>
  );
}

/** A small white sample card inside a pastel card, cut off at the bottom like a phone screen. */
export function Screen({ children }: { children: React.ReactNode }) {
  return <div className="rounded-t-[1.25rem] border-[1.5px] border-b-0 border-honey bg-white p-5 shadow-[0_-10px_30px_rgba(23,73,181,0.08)]">{children}</div>;
}

/** A white feature card with a round icon, for the stacked list. */
export function FeatureCard({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <li className="lift reveal flex gap-4 rounded-[1.25rem] bg-white p-5 shadow-[0_12px_30px_rgba(14,27,61,0.06)]">
      <IconCircle name={icon} tone="soft" />
      <div className="flex flex-col gap-1">
        <h3 className="text-[17px] font-bold">{title}</h3>
        <p className="text-[15px] leading-relaxed text-muted">{body}</p>
      </div>
    </li>
  );
}

/** A small point with a coloured round icon and a link, under a split section's words. */
export function MiniPoint({ icon, tone, title, body }: { icon: IconName; tone: "sage" | "peach" | "soft"; title: string; body: string }) {
  return (
    <div className="flex flex-col gap-2">
      <IconCircle name={icon} tone={tone} />
      <h3 className="text-[16px] font-bold">{title}</h3>
      <p className="text-[14px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

/** Icon steps on one dotted line. */
const stepTones = [
  { bg: "bg-brand", stroke: "stroke-white", ring: "shadow-[0_0_0_8px_var(--honey-soft)]" },
  { bg: "bg-coral", stroke: "stroke-navy", ring: "shadow-[0_0_0_8px_var(--peach)]" },
  { bg: "bg-honey", stroke: "stroke-navy", ring: "shadow-[0_0_0_8px_var(--honey-soft)]" },
];
export function Steps({ steps }: { steps: { icon: IconName; title: string; body: string }[] }) {
  return (
    <ol className="reveal grid gap-10 md:grid-cols-3 md:gap-6">
      {steps.map((s, i) => (
        <li key={s.title} className="relative flex flex-col items-center gap-3 text-center">
          {i < steps.length - 1 ? <span aria-hidden className="absolute left-[calc(50%+3rem)] right-[calc(-50%+3rem)] top-8 hidden border-t-[3px] border-dotted border-coral md:block" /> : null}
          <span className={`flex h-16 w-16 items-center justify-center rounded-full ${stepTones[i % 3].bg} ${stepTones[i % 3].ring}`}>
            <Icon name={s.icon} className={stepTones[i % 3].stroke} size={26} />
          </span>
          <span className="sr-only">Step {i + 1}: </span>
          <h3 className="mt-2 text-[18px] font-bold">{s.title}</h3>
          <p className="max-w-[18rem] text-[15px] leading-relaxed text-muted">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** "Ready to get started?": a heading row, then a small blue card and a wide lilac card with a picture. */
export function Ready({
  button,
  small,
  wide,
}: {
  button: { href: string; label: string };
  small: { icon: IconName; title: string; body: string; href: string; link: string };
  wide: { icon: IconName; title: string; body: string; href: string; link: string; picture: React.ReactNode };
}) {
  return (
    <div className="reveal flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-[clamp(1.75rem,2.6vw,2.25rem)] font-bold">Ready to get started?</h2>
          <p className="text-[16px] text-muted">It takes a minute, and you can stop or change your mind any time.</p>
        </div>
        <Link href={button.href} className="pressable rounded-control bg-brand px-6 py-3.5 font-bold text-white">{button.label}</Link>
      </div>
      <div className="grid gap-5 md:grid-cols-[1fr_2fr]">
        <div className="lift relative flex flex-col items-start gap-3 overflow-hidden rounded-[1.25rem] bg-brand p-7 text-white">
          <Bubbles items={["-right-12 -bottom-12 h-40 w-40 bg-coral", "right-16 top-8 h-6 w-6 border-[3px] border-honey", "-right-4 top-24 h-10 w-10 bg-white/15"]} />
          <IconCircle name={small.icon} />
          <h3 className="relative mt-2 text-[1.25rem] font-bold text-white!">{small.title}</h3>
          <p className="relative max-w-[16rem] text-[15px] leading-relaxed text-honey-soft">{small.body}</p>
          <Link href={small.href} className="relative mt-auto inline-flex items-center gap-1 pt-2 font-bold text-white hover:underline">{small.link}<Arrow /></Link>
        </div>
        <div className="relative grid items-center gap-6 overflow-hidden rounded-[1.25rem] bg-honey-soft p-7 sm:grid-cols-[1fr_1fr]">
          <Bubbles items={["-right-16 -top-16 h-48 w-48 bg-honey", "right-1/3 bottom-6 h-5 w-5 bg-coral", "left-1/2 -top-6 h-12 w-12 border-[6px] border-brand/20"]} />
          <div className="relative flex flex-col items-start gap-3">
            <IconCircle name={wide.icon} tone="blue" />
            <h3 className="mt-2 text-[1.25rem] font-bold">{wide.title}</h3>
            <p className="text-[15px] leading-relaxed text-muted">{wide.body}</p>
            <Link href={wide.href} className="inline-flex items-center gap-1 pt-2 font-bold text-brand hover:underline">{wide.link}<Arrow /></Link>
          </div>
          <div className="relative min-w-0">{wide.picture}</div>
        </div>
      </div>
    </div>
  );
}

/** A full-width blue colour block with orange and lavender bubbles bleeding off its edges. */
export function BlueBand({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-brand ${className}`}>
      <Bubbles
        items={[
          { c: "-left-24 -top-24 h-72 w-72 bg-coral", anim: "bob-slow" },
          { c: "-right-20 top-10 h-56 w-56 bg-honey", anim: "bob" },
          "left-[18%] bottom-10 h-8 w-8 border-[4px] border-honey",
          "right-[22%] top-8 h-5 w-5 bg-coral",
          "left-[45%] top-6 h-3 w-3 bg-white/60",
          "-bottom-20 right-[30%] h-40 w-40 border-[14px] border-white/10",
        ]}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

/** Small "Sample" note under a picture made of sample figures. */
export function SampleNote() {
  return <p className="mt-2 text-right text-xs text-muted">Sample</p>;
}
