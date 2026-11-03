import type { Metadata } from "next";
import Link from "next/link";
import { Illustration } from "@/components/illustration";
import { JsonLd } from "@/components/json-ld";
import { Bubbles, Key } from "@/components/marketing";
import { platformConfig } from "@/config/platform";
import { allFaqs, charityFaqs, donorFaqs, type Faq } from "@/lib/seo/faq";
import { faqData } from "@/lib/seo/structured-data";

// Questions about Givezy (draft 03/11/2026, Yehuda to approve). The answers come from lib/seo/faq.ts, which also
// feeds this page's structured data and llms.txt, so search engines, chatbots and people all read the same words.

export const metadata: Metadata = {
  title: "Questions",
  description: `What ${platformConfig.appName} costs, how charities are checked, how s18A receipts work and who sees your details.`,
};

function Group({ title, faqs }: { title: string; faqs: Faq[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-[1.625rem] font-bold">{title}</h2>
      <ul className="flex flex-col gap-3">
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
    </section>
  );
}

export default function FaqPage() {
  return (
    // full-bleed: this page runs edge to edge, with its own 1 200 px column (see globals.css).
    <div className="full-bleed overflow-x-clip">
      <JsonLd data={faqData(allFaqs)} />
      <section className="relative overflow-hidden bg-honey-soft">
        <Bubbles
          className="hidden md:block"
          items={[
            { c: "-right-24 -top-24 h-80 w-80 bg-peach" },
            { c: "-left-16 bottom-6 h-28 w-28 bg-honey", anim: "bob-slow" },
            { c: "right-[38%] top-10 h-5 w-5 bg-coral", anim: "bob" },
            { c: "right-[30%] bottom-10 h-9 w-9 border-[4px] border-brand", anim: "bob-slow" },
          ]}
        />
        <Illustration name="checklist" sparkle="stars" className="absolute bottom-0 right-[max(1.5rem,calc(50%-36rem))] hidden w-52 lg:block" />
        <div className="relative mx-auto max-w-[75rem] space-y-4 px-4 pb-10 pt-10 sm:px-6 sm:pt-14">
          <h1 className="text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.02] text-balance">Questions about <Key>{platformConfig.appName}</Key></h1>
          <p className="max-w-[36rem] text-lg text-muted">What it costs, how charities are checked, s18A receipts and your privacy, in plain words.</p>
        </div>
      </section>
      <div className="mx-auto flex max-w-[48rem] flex-col gap-10 px-4 py-10 sm:px-6">
        <Group title="Giving" faqs={donorFaqs} />
        <Group title="For charities" faqs={charityFaqs} />
        <section className="flex flex-col items-start gap-3 rounded-[1.5rem] bg-peach p-6">
          <h2 className="font-display text-[1.375rem] font-bold">Ready when you are</h2>
          <p className="text-muted">Find a charity and give in a minute, or list your charity for free.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/charities" className="pressable rounded-control bg-coral px-6 py-3.5 font-bold text-navy">Find a charity</Link>
            <Link href="/for-charities" className="pressable rounded-control bg-brand px-5 py-3.5 font-bold text-white">For charities</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
