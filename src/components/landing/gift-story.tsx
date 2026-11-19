import Image from "next/image";
import { Icon } from "@/components/marketing";
import { DEMO_CHARITY } from "@/app/demo/dashboard/sample";

// One gift's story, drawn in the app's look (17/11/2026), shared by the home page and the pre-launch page so both
// tell it the same way. Every name and amount is the dashboard demo's made-up sample data.

const charity = DEMO_CHARITY.name_en;

/* ---------- 1. The hero's story: one gift, from the phone to the receipt ---------- */

/** A small label over each piece of the story, so it reads in order: where this is happening. */
export function Where({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-brand-deep py-1 pl-1 pr-3 text-[12px] font-semibold text-white ring-1 ring-white/20">
      <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-coral text-[11px] font-extrabold text-navy">{n}</span>
      {children}
    </p>
  );
}
export const storyCard = "rounded-[1.25rem] bg-white text-navy shadow-[0_24px_60px_rgba(6,22,70,0.35)]";

/** The donor's phone, mid-gift (drawn in the app's look; the app gives the same way). */
export function GivePhone() {
  return (
    <div className="rounded-[2.6rem] bg-navy p-2.5 shadow-[0_40px_90px_rgba(6,22,70,0.45)]">
      <div className="rounded-[2.1rem] bg-white px-5 pb-6 pt-4 text-navy">
        <span aria-hidden className="mx-auto mb-5 block h-1.5 w-14 rounded-full bg-border" />
        <p className="text-[12px] font-semibold text-muted">Give to</p>
        <p className="font-display text-[1.125rem] font-extrabold leading-tight">{charity}</p>
        <p className="mt-5 font-display text-[3rem] font-extrabold leading-none tracking-[-0.03em] text-brand">R250</p>
        <div className="mt-4 flex flex-wrap gap-1.5 text-[12px] font-bold">
          <span className="rounded-full border-[1.5px] border-border px-2.5 py-1 text-brand">R100</span>
          <span className="rounded-full bg-brand px-2.5 py-1 text-white">R250</span>
          <span className="rounded-full border-[1.5px] border-border px-2.5 py-1 text-brand">R500</span>
          <span className="rounded-full border-[1.5px] border-border px-2.5 py-1 text-brand">R1 000</span>
        </div>
        <p className="mt-4 flex items-center gap-2 text-[13px] font-semibold">
          <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-md bg-sage"><Icon name="check" className="stroke-white" size={12} /></span>
          I&apos;d like an s18A receipt
        </p>
        <div className="relative mt-5 overflow-hidden rounded-[1rem] bg-coral py-3.5 text-center text-[15px] font-extrabold text-navy shadow-[0_5px_0_#d9621c]">
          <span className="relative">Give R250</span>
        </div>
      </div>
    </div>
  );
}

export function NewGift() {
  return (
    <div className={`${storyCard} flex items-center gap-3 p-3.5`}>
      <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[13px] font-bold text-brand">AS</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold leading-tight">New gift: R250</span>
        <span className="block text-[12px] leading-snug text-muted">Aisha S.</span>
        <span className="block text-[12px] leading-snug text-muted">From your Givezy page, just now</span>
      </span>
      <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-bold text-success">Paid</span>
    </div>
  );
}

export function Receipt() {
  return (
    <div className={`${storyCard} p-4`}>
      <p className="flex items-center justify-between text-[12px] font-bold text-muted">s18A receipt <span className="rounded-full bg-success-soft px-2 py-0.5 text-success">2026/27</span></p>
      <p className="mt-2 font-display text-[1.0625rem] font-extrabold leading-tight">Aisha S.</p>
      <p className="text-[12px] leading-snug text-muted">{charity}</p>
      <p className="mt-2 font-display text-[1.75rem] font-extrabold leading-none text-brand">R250</p>
      <p className="mt-2 text-[11px] text-muted">Sent after the tax year ends in February</p>
    </div>
  );
}

/**
 * One tab of the dashboard window: the real dashboard demo, phone-sized on phones and full-sized from tablets up.
 * Shot at retina size (3x phone, 2x desktop) and served as they are (`unoptimized`), so small text stays sharp
 * (Yehuda, 17/11/2026: "it must be clear as ultra HD"). Only the open tab's picture loads.
 */
/** Heights of the v6 phone pictures (all 780 wide), so the page keeps its place while they load. */
const PHONE_HEIGHTS: Record<string, number> = { overview: 1962, donations: 4704, thank: 3822, receipts: 6096 };

export function Screen({ name, alt }: { name: string; alt: string }) {
  return (
    <>
      {/* Phone: whole cards from the top of that screen, shown in a phone frame that scrolls (live-window.tsx). */}
      <Image src={`/home/screen-${name}-phone-v6.webp`} width={780} height={PHONE_HEIGHTS[name] ?? 1962} alt={alt} unoptimized className="screen-narrow block h-auto w-full sm:hidden" />
      <Image src={`/home/screen-${name}-v5.webp`} width={2340} height={1440} alt={alt} unoptimized className="screen-wide hidden h-auto w-full rounded-[0.75rem] border border-border sm:block" />
    </>
  );
}

