import Link from "next/link";

/**
 * Building blocks for the public marketing pages (home and For charities), direction B "Bands" (preview, 29/10/2026):
 * a coloured key word in each big headline, a row of solid blue cards, alternating text and picture rows,
 * a lavender band, numbered steps on one line, and a closing pair of cards (one for donors, one for charities).
 * Pictures are the product itself (sample screens), never stock illustrations.
 */

/** One or two words of a headline in Givezy blue. */
export function Key({ children }: { children: React.ReactNode }) {
  return <span className="text-brand">{children}</span>;
}

/** A small label over a section heading. */
export function Eyebrow({ children, onDark = false }: { children: React.ReactNode; onDark?: boolean }) {
  return <p className={`text-[15px] font-bold ${onDark ? "text-honey" : "text-brand"}`}>{children}</p>;
}

/** A simple line icon in a soft square. */
export function IconChip({ path, onDark = false }: { path: string; onDark?: boolean }) {
  return (
    <span aria-hidden className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${onDark ? "bg-white/15" : "bg-honey-soft"}`}>
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={onDark ? "stroke-white" : "stroke-brand"}>
        <path d={path} />
      </svg>
    </span>
  );
}

export const icons = {
  shield: "M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3zM9 12l2 2 4-4",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
  heart: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
  bank: "M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  repeat: "M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  code: "M8 8l-4 4 4 4M16 8l4 4-4 4M14 4l-4 16",
};

/** Three solid blue cards in a row: the short promises. */
export function BlueCards({ items }: { items: { icon: keyof typeof icons; title: string; body: string }[] }) {
  return (
    <ul className="grid gap-5 md:grid-cols-3">
      {items.map((it) => (
        <li key={it.title} className="flex flex-col gap-4 rounded-[1.75rem] bg-brand p-7 text-white">
          <IconChip path={icons[it.icon]} onDark />
          <h3 className="font-display text-[1.5rem] font-bold leading-tight text-white!">{it.title}</h3>
          <p className="text-[16px] leading-relaxed text-honey-soft">{it.body}</p>
        </li>
      ))}
    </ul>
  );
}

/** A picture and its words side by side; `flip` puts the picture on the left. */
export function Row({ flip = false, picture, children }: { flip?: boolean; picture: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
      <div className={`flex min-w-0 flex-col items-start gap-4 ${flip ? "md:order-2" : ""}`}>{children}</div>
      <div className={`min-w-0 ${flip ? "md:order-1" : ""}`}>{picture}</div>
    </div>
  );
}

/** A sample screen in a light window frame. */
export function Window({ children, label = "Sample" }: { children: React.ReactNode; label?: string }) {
  return (
    <figure className="overflow-hidden rounded-[1.75rem] border-[1.5px] border-border bg-surface shadow-[0_30px_60px_rgba(23,73,181,0.12)]">
      <div className="flex items-center gap-1.5 border-b border-border bg-honey-soft px-4 py-3" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full bg-honey" />
        <span className="h-2.5 w-2.5 rounded-full bg-peach" />
        <span className="h-2.5 w-2.5 rounded-full bg-brand-soft" />
      </div>
      <div className="p-5 sm:p-6">{children}</div>
      <figcaption className="px-5 pb-4 text-right text-xs text-muted sm:px-6">{label}</figcaption>
    </figure>
  );
}

/** Numbered steps joined by one line. */
export function Steps({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
      <span aria-hidden className="absolute left-7 right-7 top-7 hidden border-t-2 border-dashed border-honey md:block" />
      {steps.map((s, i) => (
        <li key={s.title} className="relative flex flex-col gap-3 md:items-center md:text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-brand font-display text-xl font-bold text-white shadow-[0_0_0_2px_var(--honey)]">
            {i + 1}
          </span>
          <h3 className="font-display text-[1.5rem] font-bold">{s.title}</h3>
          <p className="max-w-[22rem] text-[16px] leading-relaxed text-muted">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** The closing pair: one card for donors, one for charities. `primary` gets the orange button. */
export function ClosingPair({ primary }: { primary: "donor" | "charity" }) {
  const orange = "pressable rounded-control bg-coral px-6 py-3.5 font-bold text-navy";
  const white = "rounded-control bg-white px-6 py-3.5 font-bold text-navy hover:bg-honey-soft";
  const blue = "pressable rounded-control bg-brand px-6 py-3.5 font-bold text-white";
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="flex flex-col items-start gap-4 rounded-[2rem] bg-brand p-8 sm:p-10">
        <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-bold text-honey">For donors</span>
        <h3 className="font-display text-[clamp(1.75rem,3vw,2.25rem)] font-bold leading-tight text-white!">Ready to give?</h3>
        <p className="text-[17px] leading-relaxed text-honey-soft">Find a registered charity and give once or every month. Every gift lands in one list.</p>
        <Link href="/charities" className={primary === "donor" ? orange : white}>Find a charity</Link>
      </div>
      <div className="flex flex-col items-start gap-4 rounded-[2rem] bg-honey-soft p-8 sm:p-10">
        <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-brand">For charities</span>
        <h3 className="font-display text-[clamp(1.75rem,3vw,2.25rem)] font-bold leading-tight">Run a charity?</h3>
        <p className="text-[17px] leading-relaxed text-muted">Listing is free. Donations go straight to your own bank account.</p>
        <Link href={primary === "charity" ? "/apply" : "/for-charities"} className={primary === "charity" ? orange : blue}>
          {primary === "charity" ? "List your charity" : "How it works for charities"}
        </Link>
      </div>
    </div>
  );
}
