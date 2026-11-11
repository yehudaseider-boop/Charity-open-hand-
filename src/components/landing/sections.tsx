import { Icon, type IconName } from "@/components/marketing";
import { Reveal } from "@/components/reveal";
import type { Faq } from "@/lib/seo/faq";

/**
 * Sections for the long public pages (For donors, For charities, and the home page under its doors), in the landing
 * page's look (11/11/2026): big Bricolage headlines, white pages with soft lilac and peach splashes, blue colour
 * blocks with a ring and a dot bleeding off the edges, and sample pictures beside the words. Motion is the site's
 * own (sections glide in once; nothing moves for people who ask for reduced motion).
 */

export const bigTitle = "font-display text-[clamp(2.75rem,8vw,6rem)] font-extrabold leading-[0.95] tracking-[-0.035em] text-balance";
export const chapterTitle = "font-display text-[clamp(2rem,4.2vw,3.25rem)] font-extrabold leading-[1.02] tracking-[-0.025em] text-balance";

/** The page's opening: words on the left, a picture on the right, soft splashes behind. */
export function PageHero({ top, title, lead, actions, picture }: { top?: React.ReactNode; title: React.ReactNode; lead: React.ReactNode; actions: React.ReactNode; picture: React.ReactNode }) {
  return (
    <section className="relative">
      <span aria-hidden className="pointer-events-none absolute -left-40 -top-24 -z-10 h-[30rem] w-[30rem] rounded-full bg-honey-soft" />
      <span aria-hidden className="pointer-events-none absolute -right-24 top-48 -z-10 h-72 w-72 rounded-full bg-peach max-md:hidden" />
      <div className="mx-auto grid max-w-[75rem] items-center gap-12 px-4 pb-16 pt-8 sm:px-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:pb-24 md:pt-14">
        <div className="flex min-w-0 flex-col items-start gap-6">
          {top}
          <h1 className={bigTitle}>{title}</h1>
          <p className="max-w-[34rem] text-[clamp(1.125rem,2vw,1.375rem)] leading-relaxed text-muted">{lead}</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">{actions}</div>
        </div>
        <div className="min-w-0">{picture}</div>
      </div>
    </section>
  );
}

/** A small label above a chapter's title: a number in a circle and a word or two. */
function Kicker({ n, text }: { n?: number; text: string }) {
  return (
    <p className="flex items-center gap-3 text-[15px] font-bold text-brand">
      {n ? <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-brand font-display text-[1rem] text-white">{n}</span> : null}
      {text}
    </p>
  );
}

/** One idea per chapter: words and points on one side, a sample picture on the other (they swap sides as you go). */
export function Chapter({
  id,
  n,
  kicker,
  title,
  body,
  points,
  picture,
  flip = false,
  children,
}: {
  id?: string;
  n?: number;
  kicker: string;
  title: React.ReactNode;
  body: React.ReactNode;
  points?: { icon: IconName; title: string; body: string }[];
  picture: React.ReactNode;
  flip?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Reveal as="section" id={id} className="mx-auto max-w-[75rem] scroll-mt-24 px-4 py-14 sm:px-6 md:py-20">
      <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
        <div className={`flex min-w-0 flex-col items-start gap-5 ${flip ? "md:order-2" : ""}`}>
          <Kicker n={n} text={kicker} />
          <h2 className={chapterTitle}>{title}</h2>
          <p className="max-w-[32rem] text-[17px] leading-relaxed text-muted">{body}</p>
          {points ? (
            <ul className="mt-2 flex flex-col gap-4">
              {points.map((p) => (
                <li key={p.title} className="flex gap-4">
                  <span aria-hidden className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-honey-soft">
                    <Icon name={p.icon} className="stroke-brand" size={20} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[17px] font-bold">{p.title}</span>
                    <span className="text-[15px] leading-relaxed text-muted">{p.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {children}
        </div>
        <div className={`min-w-0 ${flip ? "md:order-1" : ""}`}>{picture}</div>
      </div>
    </Reveal>
  );
}

/** Numbered steps in pale lilac cards, four across on a computer, one under the other on a phone. */
export function StepCards({ id, kicker, title, lead, steps }: { id?: string; kicker: string; title: React.ReactNode; lead?: React.ReactNode; steps: { icon: IconName; title: string; body: string }[] }) {
  return (
    <Reveal as="section" id={id} className="mx-auto flex max-w-[75rem] scroll-mt-24 flex-col gap-10 px-4 py-14 sm:px-6 md:py-20">
      <div className="flex max-w-[44rem] flex-col gap-4">
        <Kicker text={kicker} />
        <h2 className={chapterTitle}>{title}</h2>
        {lead ? <p className="text-[17px] leading-relaxed text-muted">{lead}</p> : null}
      </div>
      <ol className={`grid gap-4 sm:grid-cols-2 ${steps.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {steps.map((s, i) => (
          <li key={s.title} className="lift relative flex flex-col gap-4 overflow-hidden rounded-[1.75rem] bg-honey-soft p-7">
            <span aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full border-[10px] border-honey/50" />
            <span className="flex items-center justify-between">
              <span aria-hidden className="font-display text-[3rem] font-extrabold leading-none text-brand">{i + 1}</span>
              <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-white">
                <Icon name={s.icon} className="stroke-brand" size={22} />
              </span>
            </span>
            <span className="sr-only">Step {i + 1}: </span>
            <h3 className="font-display text-[1.375rem] font-bold leading-tight">{s.title}</h3>
            <p className="text-[15px] leading-relaxed text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
    </Reveal>
  );
}

/** A big blue colour block with white words, a ring and a dot bleeding off the edges, and up to four points. */
export function BlueBlock({ id, kicker, title, body, points, children }: { id?: string; kicker: string; title: React.ReactNode; body: React.ReactNode; points: { icon: IconName; title: string; body: string }[]; children?: React.ReactNode }) {
  return (
    <Reveal as="section" id={id} className="mx-auto max-w-[75rem] scroll-mt-24 px-4 py-8 sm:px-6 md:py-12">
      <div className="relative isolate overflow-hidden rounded-[2rem] bg-brand px-6 py-12 text-white sm:px-10 md:px-14 md:py-16">
        <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 -z-10 h-56 w-56 rounded-full border-[22px] border-white/15 md:h-80 md:w-80 md:border-[30px]" />
        <span aria-hidden className="pointer-events-none absolute -bottom-8 left-[42%] -z-10 h-16 w-16 rounded-full bg-coral" />
        <span aria-hidden className="pointer-events-none absolute -left-10 bottom-16 -z-10 h-24 w-24 rounded-full bg-honey/40 max-md:hidden" />
        <div className="flex max-w-[44rem] flex-col gap-4">
          <p className="text-[15px] font-bold text-honey">{kicker}</p>
          <h2 className={`${chapterTitle} text-white!`}>{title}</h2>
          <p className="text-[17px] leading-relaxed text-honey-soft">{body}</p>
        </div>
        <ul className={`mt-10 grid gap-4 sm:grid-cols-2 ${points.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          {points.map((p) => (
            <li key={p.title} className="flex flex-col gap-3 rounded-[1.5rem] bg-white/10 p-6">
              <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-full bg-white">
                <Icon name={p.icon} className="stroke-brand" size={20} />
              </span>
              <h3 className="text-[17px] font-bold text-white!">{p.title}</h3>
              <p className="text-[15px] leading-relaxed text-honey-soft">{p.body}</p>
            </li>
          ))}
        </ul>
        {children ? <div className="mt-10">{children}</div> : null}
      </div>
    </Reveal>
  );
}

/** Questions that open in place, in the FAQ page's style. */
export function Questions({ id, title, faqs, more }: { id?: string; title: React.ReactNode; faqs: Faq[]; more?: React.ReactNode }) {
  return (
    <Reveal as="section" id={id} className="mx-auto grid max-w-[75rem] scroll-mt-24 gap-10 px-4 py-14 sm:px-6 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:py-20">
      <div className="flex flex-col items-start gap-4">
        <Kicker text="Questions" />
        <h2 className={chapterTitle}>{title}</h2>
        {more}
      </div>
      <ul className="flex min-w-0 flex-col gap-3">
        {faqs.map((f) => (
          <li key={f.q}>
            <details className="group rounded-[1.5rem] border-2 border-border bg-surface transition-colors open:border-brand open:bg-honey-soft">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-[1.5rem] px-5 py-4 text-[17px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
                {f.q}
                <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand transition-transform group-open:rotate-45">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                </span>
              </summary>
              <p className="px-5 pb-5 text-[16px] leading-relaxed text-muted">{f.a}</p>
            </details>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

/** The closing call: a lavender block with the page's one orange button. */
export function Closing({ title, body, action, side }: { title: React.ReactNode; body: React.ReactNode; action: React.ReactNode; side?: React.ReactNode }) {
  return (
    <Reveal as="section" className="mx-auto max-w-[75rem] px-4 pb-20 pt-8 sm:px-6 md:pb-28">
      <div className="relative isolate overflow-hidden rounded-[2rem] bg-honey px-6 py-12 text-navy sm:px-10 md:px-14 md:py-16">
        <span aria-hidden className="pointer-events-none absolute -right-12 -top-12 -z-10 h-48 w-48 rounded-full border-[20px] border-brand/20" />
        <span aria-hidden className="pointer-events-none absolute -bottom-6 left-[55%] -z-10 h-14 w-14 rounded-full bg-brand" />
        <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
          <div className="flex min-w-0 flex-col items-start gap-5">
            <h2 className={chapterTitle}>{title}</h2>
            <p className="max-w-[34rem] text-[17px] leading-relaxed">{body}</p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">{action}</div>
          </div>
          {side ? <div className="min-w-0 max-md:hidden">{side}</div> : null}
        </div>
      </div>
    </Reveal>
  );
}

/** The page's one orange button (ink text on orange, per the brand). */
export const orangeButton = "pressable inline-flex min-h-14 items-center rounded-[1.125rem] bg-coral px-7 text-[17px] font-bold text-navy";
/** A blue button for the second action. */
export const blueButton = "pressable inline-flex min-h-14 items-center rounded-[1.125rem] bg-brand px-7 text-[17px] font-bold text-brand-contrast";
/** A plain link with an arrow, for "See how it works". */
export const arrowLink = "inline-flex min-h-11 items-center gap-1.5 text-[17px] font-bold text-brand underline-offset-4 hover:underline";

export function ArrowRight() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="stroke-current">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
