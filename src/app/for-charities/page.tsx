import type { Metadata } from "next";
import Link from "next/link";
import { BlueCards, ClosingPair, Eyebrow, Key, Row, Steps, Window } from "@/components/marketing";
import { Splash } from "@/components/splash";
import { platformConfig } from "@/config/platform";

export const metadata: Metadata = {
  title: "For charities",
  description: "List your charity on Givezy for free. Donations go straight to your bank account, and we issue s18A receipts for you.",
};

// For charities, direction B "Bands" (preview, 29/10/2026). DRAFT WORDING for Yehuda to approve. Every claim here must
// stay true: no fee figures until the payment provider's rates are confirmed (see docs/go-live-checklist.md).
// Pictures are sample screens of the charity dashboard, labelled "Sample".

const steps = [
  { title: "Apply online", body: "Your registration details, bank account and a bank confirmation letter. Save and come back any time." },
  { title: "We check it", body: "We review every application by hand, then email you when it's approved or if something needs fixing." },
  { title: "Start receiving", body: "Add a photo and a few words about your work, share your page, and donations start coming in." },
];

const needs = [
  "Your registered name, and NPO or PBO reference number",
  "Registered address and a contact person",
  "Your bank account, with a bank confirmation letter",
  "Your PBO approval letter, if you have PBO status",
  "For s18A receipts: your s18A approval and our signed receipting mandate",
];

function Tick({ className = "stroke-sage" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`mt-0.5 shrink-0 ${className}`}>
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

/** The dashboard overview, as a sample. */
function DashboardSample() {
  const bars = [18, 40, 22, 35, 28, 52, 46, 70];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-control bg-brand p-4 text-white"><p className="text-[13px] text-honey-soft">This month</p><p className="mt-1 font-display text-[1.75rem] font-bold">R4 920</p></div>
        <div className="rounded-control bg-honey-soft p-4"><p className="text-[13px] text-muted">Every month</p><p className="mt-1 font-display text-[1.75rem] font-bold">R970</p></div>
      </div>
      <div className="flex h-28 items-end gap-2 rounded-control bg-honey-soft p-4" aria-hidden>
        {bars.map((h, i) => (
          <span key={i} className={`flex-1 rounded-t-md ${i === bars.length - 1 ? "bg-coral" : "bg-honey"}`} style={{ height: `${h}%` }} />
        ))}
      </div>
      <p className="flex items-center justify-between rounded-control border-[1.5px] border-border px-4 py-3 text-[15px]"><span>3 new donors this month</span><span className="font-bold text-brand">Say thank you</span></p>
    </div>
  );
}

/** Monthly donors, as a sample. */
function MonthlySample() {
  const rows = [
    { name: "Sarah L.", amount: "R360", state: "Running", tone: "bg-success-soft text-success" },
    { name: "Rivka K.", amount: "R180", state: "Running", tone: "bg-success-soft text-success" },
    { name: "Moshe A.", amount: "R250", state: "Card declined, trying again", tone: "bg-warning-soft text-warning" },
  ];
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.name} className="flex items-center justify-between gap-3 rounded-control border-[1.5px] border-border p-4">
          <span className="flex min-w-0 flex-col gap-1.5">
            <span className="font-bold">{r.name}</span>
            <span className={`self-start rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.tone}`}>{r.state}</span>
          </span>
          <span className="shrink-0 text-right font-display text-xl font-bold">{r.amount}<span className="block text-xs font-normal text-muted">a month</span></span>
        </li>
      ))}
    </ul>
  );
}

/** A campaign and the website button, as a sample. */
function CampaignSample() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-control bg-honey-soft p-5">
        <p className="font-bold">Winter food parcels</p>
        <div className="h-3 overflow-hidden rounded-full bg-white" aria-hidden><div className="h-3 w-[68%] rounded-full bg-sage" /></div>
        <p className="flex justify-between text-[15px]"><span className="font-bold">R34 000 raised</span><span className="text-muted">of R50 000</span></p>
      </div>
      <div className="flex flex-col items-start gap-3 rounded-control border-[1.5px] border-border p-5">
        <p className="text-[13px] text-muted">Your website</p>
        <span className="pressable rounded-control bg-brand px-5 py-3 font-bold text-white">Give with Givezy</span>
      </div>
    </div>
  );
}

export default function ForCharitiesPage() {
  return (
    <div className="full-bleed overflow-x-clip">
      {/* Hero: words on the left, the dashboard on the right */}
      <section className="bg-gradient-to-b from-honey-soft to-white">
        <div className="mx-auto max-w-[75rem] px-4 pb-20 pt-14 sm:px-6 sm:pt-20">
          <Row
            picture={
              <div className="relative">
                <Splash className="absolute -right-4 -top-20 hidden h-auto w-36 md:block" />
                <div className="relative"><Window label="Sample dashboard"><DashboardSample /></Window></div>
              </div>
            }
          >
            <Eyebrow>For charities</Eyebrow>
            <h1 className="text-[clamp(2.5rem,5vw,4.25rem)] leading-[1] text-balance">Let your supporters give to you in <Key>a few taps</Key>.</h1>
            <p className="max-w-[34rem] text-lg leading-normal text-muted sm:text-xl">
              {platformConfig.appName} helps donors find local charities, give from their phone, and keep track of their giving. Listing your organisation is free.
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-4">
              <Link href="/apply" className="pressable rounded-control bg-coral px-7 py-4 text-lg font-bold text-navy">List your charity</Link>
              <Link href="/charities" className="rounded-control border-2 border-brand bg-white px-7 py-[14px] text-lg font-bold text-brand hover:bg-honey-soft">See who&apos;s on {platformConfig.appName}</Link>
            </div>
          </Row>
        </div>
      </section>

      {/* Three blue cards */}
      <section className="mx-auto flex max-w-[75rem] flex-col gap-10 px-4 pb-20 sm:px-6">
        <div className="flex max-w-[44rem] flex-col gap-3">
          <Eyebrow>Why charities join</Eyebrow>
          <h2 className="font-display text-[clamp(2.125rem,4vw,3.25rem)] font-bold leading-[1.05] text-balance">More giving, <Key>less paperwork</Key>.</h2>
        </div>
        <BlueCards
          items={[
            { icon: "heart", title: "Free to list", body: "There is no sign-up fee and no monthly fee to be on Givezy." },
            { icon: "bank", title: "Straight to your bank", body: "Each donation is paid into your own bank account by our payment provider. The provider's card fee comes off each donation." },
            { icon: "receipt", title: "s18A receipts, done for you", body: "With s18A approval and our signed receipting mandate, we issue your donors' receipts in your name once a year." },
          ]}
        />
      </section>

      {/* Alternating rows */}
      <section className="mx-auto flex max-w-[75rem] flex-col gap-24 px-4 pb-24 sm:px-6">
        <Row flip picture={<Window><MonthlySample /></Window>}>
          <Eyebrow>Monthly donors</Eyebrow>
          <h2 className="font-display text-[clamp(2rem,3.6vw,3rem)] font-bold leading-[1.05] text-balance">Know who gives <Key>every month</Key>.</h2>
          <p className="text-lg leading-relaxed text-muted">Donors can give the same amount every month until they cancel. You see who gives monthly, how much comes in, and when a card is declined.</p>
        </Row>
        <Row picture={<Window><CampaignSample /></Window>}>
          <Eyebrow>Campaigns and your website</Eyebrow>
          <h2 className="font-display text-[clamp(2rem,3.6vw,3rem)] font-bold leading-[1.05] text-balance">Raise for something <Key>specific</Key>.</h2>
          <p className="text-lg leading-relaxed text-muted">Raising for winter food parcels or a new roof? Start a campaign with a goal and donors watch it fill up. Put a &ldquo;Give with Givezy&rdquo; button on your own website, or print a QR poster for your notice board.</p>
        </Row>
      </section>

      {/* Lavender band: what you'll need */}
      <section className="bg-honey">
        <div className="mx-auto grid max-w-[75rem] items-center gap-10 px-4 py-20 sm:px-6 md:grid-cols-[1fr_1.2fr]">
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-[clamp(2rem,3.6vw,3rem)] font-bold leading-[1.05]">What you&apos;ll need</h2>
            <p className="text-lg leading-relaxed text-navy">No s18A approval? You&apos;re still welcome. Donors can give; they just don&apos;t get a tax receipt.</p>
          </div>
          <ul className="flex flex-col gap-3 rounded-[1.75rem] bg-white p-7">
            {needs.map((n) => (
              <li key={n} className="flex gap-3 text-[16px]"><Tick />{n}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* How to join */}
      <section className="mx-auto flex max-w-[75rem] flex-col items-center gap-12 px-4 py-20 text-center sm:px-6">
        <div className="flex flex-col gap-3">
          <Eyebrow>How to join</Eyebrow>
          <h2 className="font-display text-[clamp(2.125rem,4.4vw,3.25rem)] font-bold leading-none text-balance">Three steps to <Key>your first gift</Key>.</h2>
        </div>
        <div className="w-full text-left"><Steps steps={steps} /></div>
      </section>

      <section className="mx-auto max-w-[75rem] px-4 pb-20 sm:px-6">
        <ClosingPair primary="charity" />
      </section>
    </div>
  );
}
