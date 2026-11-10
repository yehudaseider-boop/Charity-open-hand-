import Link from "next/link";
import { focusDay, type Focus } from "@/lib/charity/focus";

/**
 * The charity's own focus, in its own words, at the top of its page while its dates run. A blue colour block
 * with a white button: the page's one orange call to action stays the main Give button.
 */
export function FocusCard({ focus, giveHref, toCampaign }: { focus: Focus; giveHref: string | null; toCampaign: boolean }) {
  return (
    <section aria-labelledby="focus-title" className="relative isolate overflow-hidden rounded-[1.75rem] bg-brand p-6 text-brand-contrast sm:p-8">
      <span aria-hidden className="pointer-events-none absolute -right-12 -top-14 -z-10 h-40 w-40 rounded-full border-[16px] border-white/10 sm:h-56 sm:w-56" />
      <span aria-hidden className="pointer-events-none absolute -bottom-8 right-[18%] -z-10 h-16 w-16 rounded-full bg-coral" />
      <span aria-hidden className="pointer-events-none absolute right-8 top-8 -z-10 h-4 w-4 rounded-full bg-honey" />
      <p className="text-sm font-bold text-honey">What we&apos;re focused on right now</p>
      <h2 id="focus-title" dir="auto" className="mt-1 break-words font-display text-[clamp(1.5rem,3.5vw,2.25rem)] font-bold leading-tight text-brand-contrast">{focus.title}</h2>
      <p dir="auto" className="mt-2 max-w-2xl whitespace-pre-line break-words text-[17px] leading-relaxed">{focus.message}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        {giveHref ? (
          <Link href={giveHref} className="pressable inline-block rounded-control bg-surface px-5 py-3 font-bold text-brand">
            {toCampaign ? "Give to this campaign" : "Give"}
          </Link>
        ) : null}
        <p className="text-sm text-white/85">Until {focusDay(focus.endsOn)}</p>
      </div>
    </section>
  );
}
