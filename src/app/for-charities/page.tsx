import type { Metadata } from "next";
import Link from "next/link";
import { Confetti, Floating, Icon, Key } from "@/components/marketing";
import { platformConfig } from "@/config/platform";
import { LiveWindow } from "@/components/live-window";
import { Reveal } from "@/components/reveal";
import { AudienceSwitch } from "@/components/audience-switch";
import { Splash } from "@/components/splash";
import { Illustration } from "@/components/illustration";
import { ChecklistPicture, DashboardPicture, UpdatePicture } from "@/components/landing/pictures";
import { ArrowRight, BlueBlock, Chapter, Closing, StepCards, arrowLink, bigTitle, chapterTitle, orangeButton } from "@/components/landing/sections";
import { reviewWithin } from "@/lib/charity/review-time";

export const metadata: Metadata = {
  title: "For charities",
  description: "List your South African charity on Givezy. Donations go straight to your own bank account, s18A receipts are made for you, and your dashboard helps you keep your donors.",
};

// For charities (rebuilt 11/11/2026 in the landing page's look, Yehuda: "I run a charity" opens a full page that walks a
// charity through everything). DRAFT WORDING for Yehuda to approve. Every claim must stay true: nothing about fees or
// "free" until the fees are settled (Yehuda, 11/11/2026; see docs/go-live-checklist.md). Pictures are sample screens of
// the charity dashboard, with made-up donors and figures.

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
        <div className="rounded-xl bg-brand p-3 text-white"><p className="text-[12px] text-honey-soft">This month</p><p className="whitespace-nowrap font-display text-[1.0625rem] font-bold sm:text-[1.25rem]">R4 920</p></div>
        <div className="rounded-xl bg-honey-soft p-3"><p className="text-[12px] text-muted">Every month</p><p className="whitespace-nowrap font-display text-[1.0625rem] font-bold sm:text-[1.25rem]">R970</p></div>
        <div className="rounded-xl bg-honey-soft p-3"><p className="text-[12px] text-muted">Donors</p><p className="whitespace-nowrap font-display text-[1.0625rem] font-bold sm:text-[1.25rem]">9</p></div>
      </div>
      <div className="flex h-28 items-end gap-2 rounded-xl border-[1.5px] border-border p-3" aria-hidden>
        {bars.map((h, i) => <span key={i} className={`flex-1 rounded-t-md ${i === bars.length - 1 ? "bg-brand" : "bg-honey"}`} style={{ height: `${h}%` }} />)}
      </div>
      <ul className="flex flex-col text-[14px]">
        <li className="flex justify-between border-b border-border py-2"><span>Sarah L. · monthly</span><span className="font-bold">R360</span></li>
        <li className="flex justify-between py-2"><span>Daniel C. · in memory of Grace Dlamini</span><span className="font-bold">R500</span></li>
      </ul>
    </div>
  );
}

/** Donations as a charity sees them, as a sample (the same made-up donors as the overview). */
function DonationsScreen() {
  const rows = [
    { date: "08/11/2026", who: "Michael B.", how: "Card · s18A receipt", amount: "R1 200" },
    { date: "05/11/2026", who: "Sarah L.", how: "Monthly", amount: "R360" },
    { date: "01/11/2026", who: "Daniel C.", how: "Card · in memory of Grace Dlamini", amount: "R500" },
    { date: "28/10/2026", who: "Anonymous", how: "Card", amount: "R150" },
    { date: "20/10/2026", who: "Thandi M.", how: "EFT, recorded by you", amount: "R250" },
  ];
  return (
    <div className="flex flex-col gap-3 text-left">
      <p className="font-display text-[1.25rem] font-bold">Donations</p>
      <ul className="flex flex-col text-[13px]">
        {rows.map((r) => (
          <li key={r.date + r.who} className="flex items-center gap-3 border-b border-border py-2 last:border-0">
            <span className="w-[4.75rem] shrink-0 text-[12px] text-muted">{r.date}</span>
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{r.who}</span><span className="block truncate text-[12px] text-muted">{r.how}</span></span>
            <span className="shrink-0 font-bold">{r.amount}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Donors as a charity sees them, as a sample, with the tags a charity adds. */
function DonorsScreen() {
  const rows = [
    { who: "Sarah L.", line: "9 gifts · monthly since 03/2026", tag: "Monthly", total: "R3 240" },
    { who: "Michael B.", line: "1 gift · 08/11/2026", tag: "New", total: "R1 200" },
    { who: "Daniel C.", line: "1 gift · 01/11/2026", tag: "", total: "R500" },
    { who: "Thandi M.", line: "2 gifts · last 20/10/2026", tag: "Volunteer", total: "R500" },
  ];
  return (
    <div className="flex flex-col gap-3 text-left">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-[1.25rem] font-bold">Donors</p>
        <span aria-hidden className="rounded-full bg-coral px-3 py-1 text-[12px] font-bold text-navy">Thank donors</span>
      </div>
      <ul className="flex flex-col text-[13px]">
        {rows.map((r) => (
          <li key={r.who} className="flex items-center gap-3 border-b border-border py-2 last:border-0">
            <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-honey-soft text-[11px] font-bold text-brand">{r.who.split(" ").map((w) => w[0]).join("")}</span>
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{r.who}{r.tag ? <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">{r.tag}</span> : null}</span><span className="block truncate text-[12px] text-muted">{r.line}</span></span>
            <span className="shrink-0 font-bold">{r.total}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** s18A receipts as a charity sees them, as a sample: made by Givezy after the tax year ends. */
function ReceiptsScreen() {
  const rows = [
    { who: "Sarah L.", total: "R3 240", ok: true },
    { who: "Michael B.", total: "R1 200", ok: true },
    { who: "Thandi M.", total: "R500", ok: false },
  ];
  return (
    <div className="flex flex-col gap-3 text-left">
      <p className="font-display text-[1.25rem] font-bold">s18A receipts</p>
      <p className="rounded-xl bg-honey-soft p-3 text-[13px] text-muted">One s18A receipt for each donor who asked, for the tax year 01/03/2026 to 28/02/2027. {platformConfig.appName} makes them for you after the year ends.</p>
      <ul className="flex flex-col text-[13px]">
        {rows.map((r) => (
          <li key={r.who} className="flex items-center gap-3 border-b border-border py-2 last:border-0">
            <span className="min-w-0 flex-1 font-semibold">{r.who}</span>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${r.ok ? "bg-success-soft text-success" : "bg-peach text-navy"}`}>{r.ok ? "Details complete" : "Asked for ID number"}</span>
            <span className="w-14 shrink-0 text-right font-bold">{r.total}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ForCharitiesPage() {
  return (
    <div className="full-bleed overflow-x-clip">
      {/* Opening: the landing page's big headline over soft splashes, then the dashboard's sample screens. */}
      <section className="relative">
        <span aria-hidden className="pointer-events-none absolute -left-40 -top-24 -z-10 h-[30rem] w-[30rem] rounded-full bg-honey-soft" />
        <span aria-hidden className="pointer-events-none absolute -right-24 top-40 -z-10 h-72 w-72 rounded-full bg-peach max-md:hidden" />
        <div className="mx-auto flex max-w-[75rem] flex-col gap-6 px-4 pt-8 sm:px-6 md:pt-14">
          <AudienceSwitch current="charity" />
          <div className="grid items-end gap-8 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
            <div className="flex min-w-0 flex-col items-start gap-6">
              <h1 className={bigTitle}>Get found, get given to, <Key>keep your donors.</Key></h1>
              <p className="max-w-[36rem] text-[clamp(1.125rem,2vw,1.375rem)] leading-relaxed text-muted">
                {platformConfig.appName} helps South African donors find your charity, give from their phone, and keep coming back. Donations go to your own bank account, and your donors&apos; s18A receipts are made for you.
              </p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <Link href="/apply" className={orangeButton}>List your charity</Link>
                <Link href="/demo/dashboard" className={arrowLink}>Try the dashboard with sample data<ArrowRight /></Link>
              </div>
            </div>
            <Splash className="splash-breathe mx-auto w-[9rem] max-md:hidden md:w-full md:max-w-[16rem]" />
          </div>
        </div>

        <div className="relative mx-auto mt-14 w-full max-w-[60rem] px-4 pb-16 sm:px-6 md:pb-24">
          <Confetti />
          <div className="relative mx-auto max-w-[48rem]">
            <LiveWindow
              label="Sample screens of the charity dashboard"
              tabs={[
                { label: "Overview", screen: <DashboardScreen /> },
                { label: "Donations", screen: <DonationsScreen /> },
                { label: "Donors", screen: <DonorsScreen /> },
                { label: "s18A receipts", screen: <ReceiptsScreen /> },
              ]}
            />
            <Floating className="-left-24 bottom-8 w-60">
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
            <p className="mt-3 text-right text-xs text-muted">Sample screens. Tap the menu to look around.</p>
          </div>
        </div>
      </section>

      <StepCards
        id="join"
        kicker="How to join"
        title={<>Three steps to your <Key>first donation</Key>.</>}
        lead="Apply in one sitting, or save and come back any time."
        steps={[
          { icon: "building", title: "Apply online", body: "Your registration details, bank account and a bank confirmation letter. You can upload documents straight from your phone." },
          { icon: "shield", title: "We check it", body: `A person reviews every application within ${reviewWithin()}, then emails you when it's approved or if something needs fixing.` },
          { icon: "heart", title: "Start receiving", body: "Add a photo and a few words about your work, share your page, and donations start coming in." },
        ]}
      />

      <Chapter
        n={1}
        kicker="Getting started"
        title={<>Your dashboard shows you <Key>what&apos;s next</Key>.</>}
        body="Once you're approved, a short list on your dashboard walks you through what helps donors find you and give. Each step ticks itself off as you go."
        points={[
          { icon: "eye", title: "A page donors trust", body: "Your logo, a cover photo, what you do and where gifts go." },
          { icon: "heart", title: "Your thank-you note", body: "A few words in your name that go with every gift." },
          { icon: "qr", title: "Easy to share", body: "Your page link, a “Give with Givezy” button for your website, and a QR poster for your notice board." },
        ]}
        picture={<ChecklistPicture />}
      />

      <Chapter
        n={2}
        flip
        kicker="Every week"
        title={<>Built for <Key>busy volunteers</Key>.</>}
        body="Every donation and donor in one place, with what needs you this week at the top: new donors to thank, details to add for s18A receipts, a monthly card that was declined."
        points={[
          { icon: "chart", title: "Donations, donors and campaigns", body: "Monthly totals, who gives every month, and how each campaign is doing." },
          { icon: "download", title: "Downloads for your bookkeeper", body: "Donations and donors as a spreadsheet, whenever you need them." },
          { icon: "lock", title: "Two-step sign-in", body: "An authenticator code keeps your donors' details safe." },
        ]}
        picture={<DashboardPicture />}
      />

      <Chapter
        n={3}
        kicker="s18A receipts"
        title={<>Receipts, <Key>done for you</Key>.</>}
        body="With s18A approval and our signed receipting mandate, we make your donors' s18A receipts in your name once a year. You check them first."
        points={[
          { icon: "receipt", title: "Preview, then approve", body: "Approve, correct or decline each donor's receipt before it goes out." },
          { icon: "download", title: "The SARS IT3(d) file", body: "Made for you from the same receipts, ready when you are." },
          { icon: "mail", title: "Sent to your donors", body: "Each donor gets theirs, and it stays in their account." },
        ]}
        picture={<div className="mx-auto max-w-[28rem] rounded-[1.75rem] border-[1.5px] border-border bg-white p-6 shadow-[0_40px_80px_rgba(14,27,61,0.12)]"><ReceiptsScreen /><p className="mt-2 text-right text-xs text-muted">Sample</p></div>}
      />

      <BlueBlock
        id="keep"
        kicker="Keep your donors"
        title={<>Year after year.</>}
        body="Your dashboard does the follow-up for you, and sends at most one message a week to each donor, so nobody feels chased."
        points={[
          { icon: "mail", title: "Donor journeys", body: "Up to five emails you write, for new donors, a campaign's donors, or donors you'd like back." },
          { icon: "repeat", title: "See who to win back", body: "Who gave last year but not since, who gave more or less, and monthly donors who stopped." },
          { icon: "heart", title: "Thank-yous in your words", body: "Change the thank-you that goes with every gift, and send a personal one with a click." },
          { icon: "download", title: "Bring your donors with you", body: "Import the donors you already have from a spreadsheet." },
        ]}
      />

      <Chapter
        n={4}
        flip
        kicker="Updates and campaigns"
        title={<>Show donors <Key>what their gifts do</Key>.</>}
        body="Post updates to your page, with a YouTube or Vimeo video if you have one, and email them to your donors. Raising for something big? Start a campaign with a goal, and donors watch it fill up."
        picture={<UpdatePicture />}
      />

      <Chapter
        n={5}
        kicker="Your team"
        title={<>Everyone with <Key>the right access</Key>.</>}
        body="Owner, Admin, Finance, Fundraiser and Viewer. Each person sees and does only what their role allows, so your treasurer, your fundraiser and your volunteers can all work in the same place."
        picture={<Illustration name="workingTogether" sparkle="stars" className="mx-auto w-full max-w-[22rem]" />}
      />

      {/* What you'll need, and the two ways to join. The cost line (13/11/2026, Yehuda: yes): a monthly fee, no cut;
          no amount, which is agreed with each charity. */}
      <Reveal as="section" id="needs" className="mx-auto max-w-[75rem] scroll-mt-24 px-4 py-14 sm:px-6 md:py-20">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-5 rounded-[2rem] bg-honey-soft p-7 sm:p-10">
            <h2 className={chapterTitle}>What you&apos;ll need</h2>
            <ul className="flex flex-col gap-3 text-[16px]">
              {needs.map((n) => <li key={n} className="flex gap-3"><Tick />{n}</li>)}
            </ul>
            <p className="border-t border-border pt-4 text-[16px]"><strong>What it costs:</strong> a simple monthly fee, with no cut from your donations.</p>
          </div>
          <div className="relative isolate flex flex-col gap-6 overflow-hidden rounded-[2rem] bg-navy p-7 text-white sm:p-10">
            <span aria-hidden className="pointer-events-none absolute -right-12 -top-12 -z-10 h-40 w-40 rounded-full border-[18px] border-white/10" />
            <h2 className={`${chapterTitle} text-white!`}>Two ways to join</h2>
            <div className="border-t border-white/20 pt-5">
              <span className="rounded-full bg-white/15 px-3 py-1 text-[13px] font-bold text-honey">With s18A approval</span>
              <p className="mt-3 text-[16px] leading-relaxed text-honey-soft">Sign our receipting mandate and we issue your donors&apos; s18A receipts in your name, once a year.</p>
            </div>
            <div className="border-t border-white/20 pt-5">
              <span className="rounded-full bg-white/15 px-3 py-1 text-[13px] font-bold text-honey">Without s18A approval</span>
              <p className="mt-3 text-[16px] leading-relaxed text-honey-soft">You&apos;re still welcome. Donors can give; they just don&apos;t get a tax receipt.</p>
            </div>
          </div>
        </div>
      </Reveal>

      <Closing
        title={<>Ready to <Key>list your charity</Key>?</>}
        body="Apply in one sitting or save and come back. We check every application by hand and email you the outcome."
        action={
          <>
            <Link href="/apply" className={orangeButton}>List your charity</Link>
            <Link href="/faq" className={arrowLink}>Questions<ArrowRight /></Link>
          </>
        }
        side={<Illustration name="boxes" sparkle="hearts" className="mx-auto w-full max-w-[16rem]" />}
      />
    </div>
  );
}
