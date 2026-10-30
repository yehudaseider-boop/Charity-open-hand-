import type { Metadata } from "next";
import Link from "next/link";
import { AppWindow, BlueBand, BlueCards, Bubbles, Confetti, FeatureCard, Floating, Icon, Key, MiniPoint, PastelCard, Ready, SampleNote, Screen, SectionHead, Steps, h2Class } from "@/components/marketing";
import { platformConfig } from "@/config/platform";
import { Splash } from "@/components/splash";
import { Illustration } from "@/components/illustration";
import { reviewWithin } from "@/lib/charity/review-time";

export const metadata: Metadata = {
  title: "For charities",
  description: "List your charity on Givezy for free. Donations go straight to your bank account, and we issue s18A receipts for you.",
};

// For charities, direction B (preview, 29/10/2026), laid out after the Deupload landing page (see components/marketing.tsx).
// DRAFT WORDING for Yehuda to approve. Every claim must stay true: no fee figures until the payment provider's rates are
// confirmed (see docs/go-live-checklist.md). Pictures are sample screens of the charity dashboard.

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

/** The hero picture: the charity's overview, as a sample. */
function DashboardScreen() {
  const bars = [32, 48, 40, 62, 50, 74, 58, 90];
  return (
    <div className="flex flex-col gap-4 text-left">
      <p className="font-display text-[1.25rem] font-bold">Overview</p>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-brand p-3 text-white"><p className="text-[12px] text-honey-soft">This month</p><p className="font-display text-[1.25rem] font-bold">R4 920</p></div>
        <div className="rounded-xl bg-honey-soft p-3"><p className="text-[12px] text-muted">Every month</p><p className="font-display text-[1.25rem] font-bold">R970</p></div>
        <div className="rounded-xl bg-honey-soft p-3"><p className="text-[12px] text-muted">Donors</p><p className="font-display text-[1.25rem] font-bold">9</p></div>
      </div>
      <div className="flex h-28 items-end gap-2 rounded-xl border-[1.5px] border-border p-3" aria-hidden>
        {bars.map((h, i) => <span key={i} className={`flex-1 rounded-t-md ${i === bars.length - 1 ? "bg-brand" : "bg-honey"}`} style={{ height: `${h}%` }} />)}
      </div>
      <ul className="flex flex-col text-[14px]">
        <li className="flex justify-between border-b border-border py-2"><span>Sarah L. · monthly</span><span className="font-bold">R360</span></li>
        <li className="flex justify-between py-2"><span>Daniel C. · in memory of Chaim Cohen</span><span className="font-bold">R500</span></li>
      </ul>
    </div>
  );
}

export default function ForCharitiesPage() {
  return (
    <div className="full-bleed overflow-x-clip">
      {/* Hero */}
      <section className="relative">
        <Bubbles
          items={[
            { c: "-left-40 -top-40 h-[26rem] w-[26rem] bg-honey-soft" },
            { c: "-right-32 top-24 h-80 w-80 bg-peach" },
            { c: "left-[12%] top-28 h-6 w-6 bg-coral", anim: "bob" },
            { c: "left-[8%] top-64 h-10 w-10 border-[4px] border-brand", anim: "bob-slow" },
            { c: "right-[14%] top-16 h-8 w-8 bg-brand", anim: "bob-slow" },
            { c: "right-[9%] top-56 h-4 w-4 bg-coral", anim: "bob" },
            { c: "right-[20%] top-80 h-12 w-12 border-[5px] border-honey", anim: "bob" },
          ]}
        />
      <div className="relative mx-auto flex max-w-[75rem] flex-col items-center gap-5 px-4 pb-24 pt-14 text-center sm:px-6 sm:pt-20">
        <p className="rounded-full bg-honey-soft px-4 py-1.5 text-[14px] font-bold text-brand">For charities</p>
        <h1 className="max-w-[46rem] text-[clamp(2.375rem,4.6vw,3.5rem)] font-bold! leading-[1.12] text-balance">
          Let your supporters give to you in <Key>a few taps</Key>
        </h1>
        <p className="max-w-[36rem] text-[17px] leading-relaxed text-muted">
          {platformConfig.appName} helps donors find local charities, give from their phone, and keep track of their giving. Listing your organisation is free.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link href="/apply" className="pressable rounded-control bg-coral px-6 py-3.5 font-bold text-navy">List your charity</Link>
          <Link href="/charities" className="rounded-control border-2 border-navy/15 bg-white px-6 py-3 font-bold text-navy hover:border-brand">See who&apos;s on {platformConfig.appName}</Link>
        </div>
        <Link href="/demo/dashboard" className="inline-flex min-h-11 items-center font-bold text-brand underline underline-offset-4 hover:text-navy">Try the dashboard with sample data</Link>

        <div className="relative mt-14 w-full max-w-[60rem]">
          <Confetti />
          <Splash className="absolute -top-24 left-[6%] z-10 hidden h-auto w-32 md:block" />
          <div className="relative mx-auto max-w-[48rem]">
            <AppWindow nav={["Overview", "Donations", "Donors", "Monthly", "Campaigns", "s18A receipts"]} active={0}><DashboardScreen /></AppWindow>
            <Floating className="-left-24 top-24 w-60">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success-soft"><Icon name="check" className="stroke-success" size={16} /></span>
                <p className="text-[14px] font-bold">New donation</p>
              </div>
              <p className="mt-2 font-display text-[1.5rem] font-bold leading-none">R1 200</p>
              <p className="mt-1 text-[12px] text-muted">Michael B. · s18A receipt requested</p>
            </Floating>
            <Floating className="-right-24 -top-8 w-60">
              <p className="text-[13px] font-bold">Winter food parcels</p>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-border" aria-hidden><div className="h-2.5 w-[68%] rounded-full bg-sage" /></div>
              <p className="mt-2 flex justify-between text-[12px]"><span className="font-bold">R34 000</span><span className="text-muted">of R50 000</span></p>
            </Floating>
            <Illustration name="checklist" sparkle="stars" className="absolute -left-60 bottom-0 z-20 hidden w-52 xl:-left-72 xl:w-60 lg:block" />
            <Illustration name="boxes" float="bob" className="absolute -right-60 bottom-0 z-20 hidden w-52 xl:-right-72 xl:w-60 lg:block" />
            <p className="mt-3 text-right text-xs text-muted">Sample screens</p>
          </div>
        </div>
      </div>
      </section>

      {/* Three blue cards */}
      <section className="mx-auto flex max-w-[75rem] flex-col gap-12 px-4 pb-24 sm:px-6">
        <SectionHead title={<>Free to list. Paid to you. <Key>Receipts done.</Key></>}>
          What every charity on {platformConfig.appName} gets, from the first day.
        </SectionHead>
        <BlueCards
          items={[
            { icon: "heart", title: "Free to list", body: "There is no sign-up fee and no monthly fee to be on Givezy.", href: "/apply", link: "Start your application" },
            { icon: "bank", title: "Straight to your bank", body: "Each donation is paid into your own bank account by our payment provider. The provider's card fee comes off each donation.", href: "#pricing", link: "What it costs" },
            { icon: "receipt", title: "s18A receipts, done for you", body: "With s18A approval and our signed receipting mandate, we issue your donors' receipts in your name once a year.", href: "#needs", link: "What you'll need" },
          ]}
        />
      </section>

      {/* Two pastel cards and a wide lilac card */}
      <section className="mx-auto flex max-w-[75rem] flex-col gap-10 px-4 pb-24 sm:px-6">
        <h2 className={`max-w-[36rem] ${h2Class}`}>Tools that help you raise more, <Key>month after month</Key>.</h2>
        <div className="grid gap-5 md:grid-cols-2">
          <PastelCard tone="peach" title="Monthly donors" body="Donors can give the same amount every month until they cancel. See who gives monthly, and when a card is declined.">
            <Screen>
              <ul className="flex flex-col gap-2 text-[14px]">
                <li className="flex items-center justify-between"><span className="font-semibold">Sarah L.</span><span className="rounded-full bg-success-soft px-2 py-0.5 text-[12px] font-semibold text-success">Running</span><span className="font-bold">R360</span></li>
                <li className="flex items-center justify-between"><span className="font-semibold">Rivka K.</span><span className="rounded-full bg-success-soft px-2 py-0.5 text-[12px] font-semibold text-success">Running</span><span className="font-bold">R180</span></li>
                <li className="flex items-center justify-between"><span className="font-semibold">Moshe A.</span><span className="rounded-full bg-warning-soft px-2 py-0.5 text-[12px] font-semibold text-warning">Retrying</span><span className="font-bold">R250</span></li>
              </ul>
            </Screen>
          </PastelCard>
          <PastelCard tone="sky" title="Campaigns with a goal" body="Raising for winter food parcels or a new roof? Start a campaign and donors watch it fill up.">
            <Screen>
              <p className="text-[14px] font-bold">New roof for the hall</p>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-border" aria-hidden><div className="h-3 w-[42%] rounded-full bg-sage" /></div>
              <p className="mt-2 flex justify-between text-[13px]"><span className="font-bold">R63 000 raised</span><span className="text-muted">of R150 000</span></p>
              <p className="mt-3 text-[13px] font-bold text-brand">Share the campaign</p>
            </Screen>
          </PastelCard>
        </div>
        <div className="grid items-center gap-8 rounded-[1.25rem] bg-honey-soft p-7 sm:p-10 md:grid-cols-2">
          <div className="flex flex-col items-start gap-4">
            <h3 className="font-display text-[clamp(1.625rem,2.6vw,2.125rem)] font-bold leading-tight"><Key>Your website</Key>, your notice board, your WhatsApp groups.</h3>
            <p className="text-[16px] leading-relaxed text-muted">Put a &ldquo;Give with Givezy&rdquo; button on your own website, share your page link, or print a QR poster. People who arrive this way see only your charity.</p>
            <div className="mt-2 flex flex-wrap gap-3">
              <Link href="/apply" className="pressable rounded-control bg-brand px-5 py-3 font-bold text-white">List your charity</Link>
              <Link href="/charities" className="rounded-control border-2 border-navy/15 bg-white px-5 py-[10px] font-bold text-navy hover:border-brand">See an example page</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Illustration name="shareOnline" sparkle="hearts" className="col-span-2 mx-auto w-full max-w-[16rem]" />
            <div className="flex flex-col items-center gap-3 rounded-[1.125rem] bg-white p-5 text-center shadow-[0_12px_30px_rgba(14,27,61,0.06)]">
              <p className="text-[12px] text-muted">On your website</p>
              <span className="pressable rounded-control bg-brand px-4 py-2.5 text-[14px] font-bold text-white">Give with Givezy</span>
            </div>
            <div className="flex flex-col items-center gap-3 rounded-[1.125rem] bg-white p-5 text-center shadow-[0_12px_30px_rgba(14,27,61,0.06)]">
              <p className="text-[12px] text-muted">On your notice board</p>
              <Icon name="qr" className="stroke-navy" size={56} />
            </div>
            <div className="col-span-2"><SampleNote /></div>
          </div>
        </div>
      </section>

      {/* Soft section */}
      <section className="relative overflow-hidden bg-honey-soft">
        <Bubbles items={[{ c: "-left-20 bottom-10 h-56 w-56 bg-peach", anim: "bob-slow" }, { c: "right-[40%] top-10 h-6 w-6 bg-coral", anim: "bob" }, "-right-24 -top-24 h-72 w-72 bg-honey", "left-[30%] bottom-8 h-10 w-10 border-[4px] border-brand/40"]} />
        <div className="relative mx-auto grid max-w-[75rem] items-center gap-12 px-4 py-24 sm:px-6 md:grid-cols-2">
          <div className="flex flex-col gap-5">
            <h2 className={h2Class}>Your own dashboard, built for <Key>busy volunteers</Key>.</h2>
            <p className="text-[17px] leading-relaxed text-muted">See every donation and donor in one place, thank new donors, and hand your bookkeeper what they need.</p>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <MiniPoint icon="lock" tone="sage" title="Two-step sign-in" body="An authenticator code keeps your donors' details safe." />
              <MiniPoint icon="mail" tone="peach" title="Thank your donors" body="See who is new this month and send a thank-you." />
            </div>
          </div>
          <ul className="flex flex-col gap-4">
            <FeatureCard icon="chart" title="Donations and donors" body="Every donation, your donors, monthly totals and how your campaigns are doing." />
            <FeatureCard icon="download" title="Downloads for your bookkeeper" body="Download donations and donors as CSV whenever you need them." />
            <FeatureCard icon="receipt" title="s18A receipts in one list" body="See every receipt issued in your name. We send them to your donors for you." />
          </ul>
        </div>
      </section>

      {/* Coloured band with cards over its edge */}
      <section id="pricing" className="pb-24">
        <BlueBand className="pb-48 pt-20">
          <div className="mx-auto flex max-w-[44rem] flex-col items-center gap-3 px-4 text-center sm:px-6">
            <h2 className="font-display text-[clamp(1.875rem,3.2vw,2.75rem)] font-bold leading-[1.12] text-white!">Simple. <span className="text-honey">Free</span> to list.</h2>
            <p className="text-[17px] leading-relaxed text-honey-soft">No sign-up fee, no monthly fee. The card provider&apos;s fee comes off each donation.</p>
          </div>
        </BlueBand>
        <div id="needs" className="relative z-10 mx-auto -mt-36 grid max-w-[56rem] gap-0 px-4 sm:px-6 md:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-[1.25rem] bg-white p-8 shadow-[0_30px_60px_rgba(14,27,61,0.12)] md:rounded-r-none">
            <p className="text-center text-[18px] font-bold">What you&apos;ll need</p>
            <p className="text-center font-display text-[3rem] font-bold leading-none">R0</p>
            <p className="text-center text-[13px] text-muted">to list your charity</p>
            <Link href="/apply" className="pressable mt-3 rounded-control bg-brand px-5 py-3 text-center font-bold text-white">Start your application</Link>
            <ul className="mt-3 flex flex-col gap-2 text-[14px]">
              {needs.map((n) => <li key={n} className="flex gap-2"><Tick />{n}</li>)}
            </ul>
          </div>
          <div className="flex flex-col gap-5 rounded-[1.25rem] bg-navy p-8 text-white shadow-[0_30px_60px_rgba(14,27,61,0.25)] md:mt-8 md:rounded-l-none">
            <p className="text-[18px] font-bold">Two ways to join</p>
            <div className="border-t border-white/20 pt-4">
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[12px] font-bold text-honey">With s18A approval</span>
              <p className="mt-2 text-[15px] leading-relaxed text-honey-soft">Sign our receipting mandate and we issue your donors&apos; s18A receipts in your name, once a year.</p>
            </div>
            <div className="border-t border-white/20 pt-4">
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[12px] font-bold text-honey">Without s18A approval</span>
              <p className="mt-2 text-[15px] leading-relaxed text-honey-soft">You&apos;re still welcome. Donors can give; they just don&apos;t get a tax receipt.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How to join */}
      <section className="mx-auto flex max-w-[75rem] flex-col gap-14 px-4 pb-24 sm:px-6">
        <SectionHead title="How to join">Three steps to your first donation. Save your application and come back any time.</SectionHead>
        <Steps
          steps={[
            { icon: "building", title: "Apply online", body: "Your registration details, bank account and a bank confirmation letter." },
            { icon: "shield", title: "We check it", body: `We review every application by hand within ${reviewWithin()}, then email you when it's approved or if something needs fixing.` },
            { icon: "heart", title: "Start receiving", body: "Add a photo and a few words about your work, share your page, and donations start coming in." },
          ]}
        />
      </section>

      <section className="mx-auto max-w-[75rem] px-4 pb-24 sm:px-6">
        <Ready
          button={{ href: "/apply", label: "List your charity" }}
          small={{ icon: "user", title: "Giving yourself?", body: "Find a registered charity and give once or every month.", href: "/charities", link: "Find a charity" }}
          wide={{
            icon: "building",
            title: "Run a charity?",
            body: "Apply in one sitting or save and come back. We check every application by hand and email you the outcome.",
            href: "/apply",
            link: "Start your application",
            picture: <Illustration name="workingTogether" sparkle="stars" className="mx-auto w-full max-w-[18rem]" />,
          }}
        />
      </section>
    </div>
  );
}
