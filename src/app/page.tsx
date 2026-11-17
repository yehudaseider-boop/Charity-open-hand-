import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChromeMark } from "@/components/chrome-mark";
import { HeaderNav } from "@/components/header-nav";
import { JsonLd } from "@/components/json-ld";
import { Illustration } from "@/components/illustration";
import { ArrowRight, Questions, arrowLink } from "@/components/landing/sections";
import { PhonePicture } from "@/components/landing/pictures";
import { LiveWindow } from "@/components/live-window";
import { Icon, type IconName } from "@/components/marketing";
import { Reveal } from "@/components/reveal";
import { Splash } from "@/components/splash";
import { appLinks } from "@/config/app-links";
import { legalConfig } from "@/config/legal";
import { platformConfig } from "@/config/platform";
import { DEMO_CHARITY } from "@/app/demo/dashboard/sample";
import { siteOrigin } from "@/lib/request-origin";
import { charityFaqs, donorFaqs, withoutCostQuestions } from "@/lib/seo/faq";
import { organisationData } from "@/lib/seo/structured-data";

// The home page (Yehuda, 17/11/2026: "I love it", then "everything connected and synced"). Planned from what a visitor
// needs rather than from what we have: most visitors are donors ("what is this, can I trust it, how fast can I give?")
// and don't care about a dashboard; charities want to see the dashboard once, properly, and click around in it. So
// every section has one job and one picture, and nothing repeats:
//   1 hero: one gift's story (you give, they see it, you're thanked, tax time sorted)
//   2 two doors: I give / I run a charity
//   3 for donors: three steps and the phone
//   4 for charities: the real dashboard, once, in a window with tabs to click
//   5 trust facts · 6 the comparison · 7 questions · 8 the close · footer
// The header is the site's own (HeaderNav, in a blue look), so Account, Charity dashboard and Givezy admin show here
// exactly as on every other page. Layout and rhythm follow a reference site studied on 17/11/2026 (restrained type,
// dark and light bands, generous space); none of its words, pictures or logos are used. Wording is fact-checked
// against the code (decisions.md, 17/11/2026); nothing about fees; every screen is the dashboard demo's made-up
// sample data. Reads nothing from the request, so it is built once and served from cache.

export const metadata: Metadata = {
  title: { absolute: `${platformConfig.appName}: giving, made easy` },
  description: `${platformConfig.appName} is a South African giving platform, launching ${appLinks.launchMonth ?? "soon"}. Give to checked charities and keep every s18A receipt in one place. For charities: s18A receipts, thank-yous and the tools to keep their donors.`,
};

/** The site's address for structured data, or nothing before SITE_URL is set (local development). */
function origin(): string {
  try {
    return siteOrigin("");
  } catch {
    return "";
  }
}

const appName = platformConfig.appName;
const charity = DEMO_CHARITY.name_en;

// Headings: regular-weight Bricolage with one phrase in its extra-bold and a second colour. The `!` beats the
// site's global heading rule (colour, weight, spacing), which is not inside a layer.
const sizeH1 = "text-[clamp(2.75rem,5.2vw,4.75rem)] leading-[1.04]";
const sizeH2 = "text-[clamp(2.25rem,4.2vw,3.75rem)] leading-[1.08]";
function H({ as: Tag = "h2", size, dark = false, className = "", children }: { as?: "h1" | "h2"; size: "h1" | "h2"; dark?: boolean; className?: string; children: React.ReactNode }) {
  return <Tag className={`font-display ${size === "h1" ? sizeH1 : sizeH2} font-medium! tracking-[-0.03em]! text-balance ${dark ? "text-white!" : "text-indigo!"} ${className}`}>{children}</Tag>;
}
/** The one emphasised phrase in a heading. */
function Em({ dark = false, children }: { dark?: boolean; children: React.ReactNode }) {
  return <em className={`font-extrabold not-italic ${dark ? "text-honey" : "text-brand"}`}>{children}</em>;
}
/** A small label with a hairline above it. Sentence case, as the brand does. */
function Eyebrow({ dark = false, center = false, children }: { dark?: boolean; center?: boolean; children: React.ReactNode }) {
  return <p className={`w-full max-w-[24rem] border-t pt-3 text-[14px] font-semibold ${center ? "mx-auto text-center" : ""} ${dark ? "border-white/30 text-white/80" : "border-navy/20 text-muted"}`}>{children}</p>;
}

const orangeBtn = "pressable inline-flex min-h-12 items-center rounded-[1.125rem] bg-coral px-6 text-[16px] font-bold text-navy";
const inkBtn = "inline-flex min-h-12 items-center rounded-[1.125rem] bg-navy px-6 text-[16px] font-bold text-white transition-colors hover:bg-brand";
const lineBtn = "inline-flex min-h-12 items-center rounded-[1.125rem] border-[1.5px] border-navy/30 px-6 text-[16px] font-bold text-navy transition-colors hover:border-navy";
const whiteBtn = "inline-flex min-h-12 items-center rounded-[1.125rem] bg-white px-6 text-[16px] font-bold text-brand transition-colors hover:bg-honey-soft";
const lineBtnDark = "inline-flex min-h-12 items-center gap-1.5 rounded-[1.125rem] border-[1.5px] border-white/40 px-6 text-[16px] font-bold text-white transition-colors hover:border-white";

/* ---------- 1. The hero's story: one gift, from the phone to the receipt ---------- */

/** A small label over each piece of the story, so it reads in order: where this is happening. */
function Where({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-brand-deep py-1 pl-1 pr-3 text-[12px] font-semibold text-white ring-1 ring-white/20">
      <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-coral text-[11px] font-extrabold text-navy">{n}</span>
      {children}
    </p>
  );
}
const card = "rounded-[1.25rem] bg-white text-navy shadow-[0_24px_60px_rgba(6,22,70,0.35)]";

/** The donor's phone, mid-gift (drawn in the app's look; the app gives the same way). */
function GivePhone() {
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

function NewGift() {
  return (
    <div className={`${card} flex items-center gap-3 p-3.5`}>
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

function Receipt() {
  return (
    <div className={`${card} p-4`}>
      <p className="flex items-center justify-between text-[12px] font-bold text-muted">s18A receipt <span className="rounded-full bg-success-soft px-2 py-0.5 text-success">2026/27</span></p>
      <p className="mt-2 font-display text-[1.0625rem] font-extrabold leading-tight">Aisha S.</p>
      <p className="text-[12px] leading-snug text-muted">{charity}</p>
      <p className="mt-2 font-display text-[1.75rem] font-extrabold leading-none text-brand">R250</p>
      <p className="mt-2 text-[11px] text-muted">Sent after the tax year ends in February</p>
    </div>
  );
}

/* ---------- Small pieces ---------- */

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand font-display text-[1.0625rem] font-extrabold text-white">{n}</span>
      <span className="flex flex-col gap-1">
        <span className="font-display text-[1.25rem] font-bold leading-tight">{title}</span>
        <span className="text-[16px] leading-relaxed text-muted">{body}</span>
      </span>
    </li>
  );
}

/**
 * One tab of the dashboard window: the real dashboard demo, phone-sized on phones and full-sized from tablets up.
 * Shot at retina size (3x phone, 2x desktop) and served as they are (`unoptimized`), so small text stays sharp
 * (Yehuda, 17/11/2026: "it must be clear as ultra HD"). Only the open tab's picture loads.
 */
function Screen({ name, alt }: { name: string; alt: string }) {
  return (
    <>
      <Image src={`/home/screen-${name}-phone-v5.webp`} width={1170} height={1650} alt={alt} unoptimized className="block h-auto w-full rounded-[0.75rem] border border-border sm:hidden" />
      <Image src={`/home/screen-${name}-v5.webp`} width={2340} height={1440} alt={alt} unoptimized className="hidden h-auto w-full rounded-[0.75rem] border border-border sm:block" />
    </>
  );
}

const comparison: [string, string, string][] = [
  ["s18A receipts", "Typed one by one", "Preview, then approve each one"],
  ["The SARS IT3(d) file", "Put together by hand", "Prepared for you from the same receipts"],
  ["Monthly donations", "Checked against the bank statement", "Tracked for you, and a declined card is tried again"],
  ["Thank-yous", "Written and sent one at a time", "Your words, sent to everyone who gave that month"],
  ["Who gave", "Spread across bank references and spreadsheets", "Every gift in one list"],
];

const footerGroups: [string, [string, string][]][] = [
  ["For donors", [["/charities", "Find a charity"], ["/for-donors", "How giving works"], ["/login", "Sign in"]]],
  ["For charities", [["/for-charities", "What charities get"], ["/apply", "Apply to list your charity"], ["/demo/dashboard", "Try the demo dashboard"]]],
  [appName, [["/faq", "Questions"], ["/privacy", "Privacy"], ["/terms", "Terms"]]],
];

export default function HomePreview() {
  const contact = legalConfig.supportEmail;
  return (
    <div className="full-bleed overflow-x-clip">
      <ChromeMark kind="landing" />
      {origin() ? <JsonLd data={organisationData(origin())} /> : null}

      <header className="sticky top-0 z-50 border-b border-white/10 bg-brand/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[80rem] items-center justify-between gap-3 px-4 sm:h-[4.5rem] sm:px-6">
          <Link href="/" aria-label={`${appName} home`} className="-ml-1.5 flex items-center rounded-full bg-white px-3 py-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt={appName} width={97} height={32} className="h-7 w-auto sm:h-8" />
          </Link>
          <HeaderNav tone="dark" />
        </div>
      </header>

      {/* 1. Hero: the promise, and one gift's story beside it. */}
      <section className="hero-glow relative overflow-hidden bg-brand text-white">
        <div className="mx-auto grid max-w-[80rem] items-center gap-10 px-4 pb-16 pt-12 sm:px-6 xl:min-h-[44rem] xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] xl:gap-6 xl:py-20">
          <div className="flex min-w-0 flex-col items-start gap-7">
            {appLinks.launchMonth ? (
              <p className="inline-flex items-center gap-2.5 rounded-full bg-white/12 px-4 py-2 text-[14px] font-semibold text-white ring-1 ring-white/20">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-coral" />
                Coming {appLinks.launchMonth}
              </p>
            ) : null}
            <H as="h1" size="h1" dark>Giving, <Em dark>made easy.</Em></H>
            <p className="max-w-[32rem] text-pretty text-[clamp(1.0625rem,1.5vw,1.25rem)] leading-relaxed text-white/85">
              Find a charity you trust, give in a few taps, and never chase an s18A receipt again. For charities: every gift, every donor and every receipt in one place.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/charities" className={orangeBtn}>Find a charity</Link>
              <Link href="#charities" className={lineBtnDark}>I run a charity<ArrowRight /></Link>
            </div>
          </div>

          {/* One gift, in order: given on the phone, seen by the charity, thanked in the inbox, kept for tax time. */}
          <figure className="relative mx-auto w-full max-w-[36rem]">
            <figcaption className="sr-only">One gift with {appName}: a donor gives R250 from their phone; it shows on the charity&apos;s dashboard straight away; the donor gets a thank-you email; and the gift is on their s18A receipt at tax time. Made-up example.</figcaption>
            <div aria-hidden className="relative grid items-start gap-6 sm:grid-cols-[15.5rem_minmax(0,1fr)]">
              <span className="absolute -right-10 top-4 h-72 w-72 rounded-full border-[40px] border-honey/25" />
              <div className="hero-rise relative mx-auto w-[15rem] sm:w-full" style={{ animationDelay: "120ms" }}>
                <div className="bob-slow"><Where n={1}>You give</Where><GivePhone /></div>
              </div>
              <div className="relative flex flex-col gap-5">
                <div className="hero-rise sm:mr-6" style={{ animationDelay: "380ms" }}>
                  <div className="bob"><Where n={2}>They see it</Where><NewGift /></div>
                </div>
                <div className="hero-rise sm:ml-6" style={{ animationDelay: "620ms" }}>
                  <div className="bob-slow"><Where n={3}>You&apos;re thanked</Where>
                    <div className={`${card} overflow-hidden p-1.5`}><Image src="/home/email-v5.webp" width={1056} height={868} alt="" unoptimized priority className="block h-auto w-full rounded-[1rem]" /></div>
                  </div>
                </div>
                <div className="hero-rise sm:mr-10" style={{ animationDelay: "860ms" }}>
                  <div className="bob"><Where n={4}>Tax time, sorted</Where><Receipt /></div>
                </div>
              </div>
            </div>
          </figure>
        </div>
        <p className="mx-auto max-w-[80rem] px-4 pb-8 text-[13px] text-white/80 sm:px-6">Made-up example. {charity} and its donors are sample data from our dashboard demo.</p>
      </section>

      {/* 2. Two doors: each visitor picks their side. */}
      <section className="bg-white">
        <Reveal className="mx-auto max-w-[80rem] px-4 py-20 sm:px-6 md:py-28">
          <div className="mx-auto flex max-w-[48rem] flex-col items-center gap-6 text-center">
            <Eyebrow center>Two sides, one place</Eyebrow>
            <H size="h2">Two sides of every gift, <Em>finally on the same page.</Em></H>
          </div>
          <ul className="mt-14 grid gap-5 lg:grid-cols-2">
            {([
              ["bg-honey-soft", "I give", "Every charity checked by a real person. Every gift and every s18A receipt in one account, ready when SARS asks.", "#donors", "How giving works", "/charities", "Find a charity", "loveIt", "hearts"],
              ["bg-peach", "I run a charity", "Get found, get given to and keep your donors. The receipts, the reminders and the record-keeping, done with you.", "#charities", "See the dashboard", "/apply", "Apply to list your charity", "workingTogether", "stars"],
            ] as const).map(([bg, title, body, more, moreLabel, href, cta, art, sparkle]) => (
              <li key={title} className={`lift relative flex flex-col justify-between gap-8 overflow-hidden rounded-[2rem] p-8 md:p-10 lg:min-h-[22rem] ${bg}`}>
                <Illustration name={art} sparkle={sparkle} className={`absolute right-5 top-6 sm:right-8 sm:top-8 ${art === "loveIt" ? "w-20 sm:w-32" : "w-28 sm:w-44"}`} />
                <div className="relative flex flex-col gap-3 pr-24 sm:pr-48">
                  <h3 className="font-display text-[clamp(2rem,3.4vw,2.75rem)] font-bold! leading-none tracking-[-0.03em]!">{title}</h3>
                  <p className="text-[17px] leading-relaxed text-navy/80">{body}</p>
                </div>
                <div className="relative flex flex-wrap items-center gap-4">
                  <Link href={href} className={inkBtn}>{cta}</Link>
                  <Link href={more} className={arrowLink}>{moreLabel}<ArrowRight /></Link>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* 3. For donors: three steps, and the phone. */}
      <section id="donors" className="scroll-mt-20 bg-honey-soft">
        <Reveal className="mx-auto grid max-w-[80rem] items-center gap-14 px-4 py-20 sm:px-6 md:grid-cols-2 md:gap-20 md:py-28">
          <div className="flex min-w-0 flex-col gap-8">
            <Eyebrow>For donors</Eyebrow>
            <H size="h2">Give in a few taps. <Em>Keep every receipt.</Em></H>
            <ol className="flex flex-col gap-6">
              <Step n="1" title="Find a charity you can trust" body="Search by name, cause or area. A person checks every charity before it can take a single rand." />
              <Step n="2" title="Give once or every month, and watch it grow" body={`In the ${appName} app, see how much you've given this tax year, set a giving goal if you like, and watch your ring fill up.`} />
              <Step n="3" title="Let tax time take care of itself" body="Sign in with the email you gave with: every gift is in one place, and your s18A receipt follows after the tax year ends." />
            </ol>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/charities" className={inkBtn}>Find a charity</Link>
              <Link href="/for-donors" className={lineBtn}>More about giving</Link>
            </div>
          </div>
          <div className="relative min-w-0">
            <span aria-hidden className="absolute -right-6 -top-6 h-48 w-48 rounded-full bg-peach" />
            <span aria-hidden className="absolute -bottom-4 left-4 h-24 w-24 rounded-full bg-honey/60" />
            <div className="relative"><PhonePicture /></div>
          </div>
        </Reveal>
      </section>

      {/* 4. For charities: the real dashboard, once, in a window to click around in. */}
      <section id="charities" className="scroll-mt-20 bg-brand text-white">
        <div className="mx-auto max-w-[80rem] px-4 py-20 sm:px-6 md:py-28">
          <Reveal className="mx-auto flex max-w-[52rem] flex-col items-center gap-6 text-center">
            <Eyebrow dark center>For charities</Eyebrow>
            <H size="h2" dark>Your charity&apos;s giving, <Em dark>all in one place.</Em></H>
            <p className="max-w-[36rem] text-[clamp(1.0625rem,1.5vw,1.1875rem)] leading-relaxed text-white/85">This is the real dashboard, with a made-up charity. Click around: it&apos;s what you&apos;ll use from launch day.</p>
          </Reveal>
          <Reveal className="mx-auto mt-12 max-w-[80rem] text-navy">
            <LiveWindow
              label="The charity dashboard, with sample data"
              menuFrom="lg"
              tabs={[
                { label: "Overview", screen: <Screen name="overview" alt="The overview: what needs you this week, this month's total and the tax year so far. Sample data." /> },
                { label: "Donations", screen: <Screen name="donations" alt="The donations list: every gift with who gave, what for, where it came from and the date. Sample data." /> },
                { label: "Monthly donations", screen: <Screen name="monthly" alt="Monthly donations: what comes in each month, and each monthly donor. Sample data." /> },
                { label: "Thank donors", screen: <Screen name="thank" alt="Thank donors: your own note, and a preview of the email the donor gets. Sample data." /> },
                { label: "s18A receipts", screen: <Screen name="receipts" alt="s18A receipts: the yearly list, ready to check and approve. Sample data." /> },
                { label: "Campaigns", screen: <Screen name="campaigns" alt="Campaigns: each one with its goal and how close it is. Sample data." /> },
              ]}
            />
          </Reveal>
          <ul className="mx-auto mt-14 grid max-w-[80rem] gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {([
              ["receipt", "s18A receipts, done with you", "Preview and approve each one, and we prepare your IT3(d) file for SARS."],
              ["heart", "Thank-yous in your words", "One note a month reaches everyone who gave, each by their first name."],
              ["repeat", "Monthly donations looked after", "A declined card is tried again automatically."],
              ["user", "Your whole team, each with the right access", "Owner, admin, finance, fundraiser or viewer."],
            ] as [IconName, string, string][]).map(([icon, title, body]) => (
              <li key={title} className="flex flex-col gap-2 border-t border-white/25 pt-5">
                <Icon name={icon} className="stroke-white" size={22} />
                <span className="font-display text-[1.125rem] font-bold">{title}</span>
                <span className="text-[15px] leading-relaxed text-white/80">{body}</span>
              </li>
            ))}
          </ul>
          <div className="mt-12 flex flex-wrap justify-center gap-3">
            <Link href="/demo/dashboard" className={whiteBtn}>Try the demo dashboard</Link>
            <Link href="/apply" className={lineBtnDark}>Apply to list your charity</Link>
          </div>
        </div>
      </section>

      {/* 5. Big facts, no invented numbers. */}
      <section className="bg-white">
        <Reveal className="mx-auto max-w-[80rem] px-4 py-20 sm:px-6 md:py-28">
          <div className="mx-auto flex max-w-[48rem] flex-col items-center gap-6 text-center">
            <Eyebrow center>Built to be trusted with money</Eyebrow>
            <H size="h2">Safe for donors. <Em>Simple for charities.</Em></H>
          </div>
          <ul className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
            {([
              ["1", "s18A receipt a year from each charity that issues them, checked by the charity before it goes out."],
              ["0", "rand of a charity's gift held by Givezy. Your gift is paid to the charity, not to us."],
              ["100%", "of charities are looked at by a person: registration documents and bank details are checked before they can take a gift."],
            ] as [string, string][]).map(([big, text]) => (
              <li key={big} className="flex flex-col gap-4 border-t-2 border-navy/15 pt-6">
                <span className="font-display text-[clamp(4.5rem,9vw,7.5rem)] font-bold leading-[0.9] tracking-[-0.045em] text-brand">{big}</span>
                <span className="max-w-[22rem] text-[17px] leading-relaxed text-muted">{text}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* 6. The comparison, for charities. */}
      <section className="bg-brand text-white">
        <div className="mx-auto max-w-[80rem] px-4 py-20 sm:px-6 md:py-28">
          <Reveal className="mx-auto flex max-w-[52rem] flex-col items-center gap-6 text-center">
            <Eyebrow dark center>Why charities switch</Eyebrow>
            <H size="h2" dark>Bank references and spreadsheets <Em dark>had a good run.</Em></H>
          </Reveal>
          <div className="mt-14">
            <div aria-hidden className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.5fr)] gap-x-6 pb-4 md:grid">
              <span />
              <span className="font-display text-[1.25rem] font-bold text-white/70">Bank references and spreadsheets</span>
              <span className="rounded-t-[1.5rem] bg-white px-7 pb-4 pt-6 font-display text-[1.5rem] font-extrabold text-brand">{appName}</span>
            </div>
            <ul className="flex flex-col gap-4 md:gap-0">
              {comparison.map(([what, hand, us], i) => (
                <li key={what} className="grid gap-3 rounded-[1.5rem] border border-white/15 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.5fr)] md:items-stretch md:gap-x-6 md:rounded-none md:border-0 md:border-t md:border-white/15 md:p-0">
                  <h3 className="font-display text-[1.375rem] font-bold! leading-tight text-white! md:py-6">{what}</h3>
                  <p className="flex items-start gap-3 text-[16px] leading-relaxed text-white/80 md:py-6">
                    <span aria-hidden className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/40 text-[13px] leading-none">×</span>
                    <span><span className="md:hidden">By hand: </span>{hand}</span>
                  </p>
                  <p className={`flex items-start gap-3 rounded-[1rem] bg-white px-5 py-4 text-[16px] font-semibold leading-relaxed text-navy md:rounded-none md:px-7 md:py-6 ${i === comparison.length - 1 ? "md:rounded-b-[1.5rem]" : ""}`}>
                    <span aria-hidden className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage"><Icon name="check" className="stroke-white" size={12} /></span>
                    <span><span className="md:hidden">{appName}: </span>{us}</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 7. Questions. */}
      <Questions
        title={<>Good to <em className="font-extrabold not-italic text-brand">know</em>.</>}
        faqs={withoutCostQuestions([...donorFaqs.slice(0, 2), ...donorFaqs.filter((f) => /s18A|monthly|every month/i.test(f.q)), ...charityFaqs])}
        more={<Link href="/faq" className={arrowLink}>All questions<ArrowRight /></Link>}
        width="max-w-[80rem]"
      />

      {/* 8. The close. */}
      <section className="hero-glow relative overflow-hidden bg-brand text-white">
        <Reveal className="mx-auto flex max-w-[80rem] flex-col items-center gap-8 px-4 py-24 text-center sm:px-6 md:py-36">
          <span className="flex h-28 w-28 items-center justify-center rounded-full bg-white shadow-[0_20px_50px_rgba(6,22,70,0.35)] md:h-32 md:w-32"><Splash className="w-16 md:w-20" /></span>
          <H size="h1" dark className="max-w-[56rem]">January is close. <Em dark>Be there from day one.</Em></H>
          <p className="max-w-[32rem] text-[clamp(1.0625rem,1.5vw,1.25rem)] leading-relaxed text-white/85">Find a charity you trust and give in a few taps, or list yours and let the receipts take care of themselves.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/charities" className={orangeBtn}>Find a charity</Link>
            <Link href="/apply" className={lineBtnDark}>Apply to list your charity</Link>
          </div>
        </Reveal>
      </section>

      <footer className="bg-brand-deep text-white">
        <div className="mx-auto grid max-w-[80rem] gap-10 px-4 py-14 text-[15px] sm:grid-cols-2 sm:px-6 md:grid-cols-4">
          <div className="flex flex-col gap-3">
            <Link href="/" aria-label={`${appName} home`} className="flex w-fit items-center rounded-full bg-white px-3 py-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt={appName} width={97} height={32} className="h-7 w-auto" />
            </Link>
            <p className="text-white/75">Giving, made easy.</p>
          </div>
          {footerGroups.map(([head, links]) => (
            <nav key={head} aria-label={head} className="flex flex-col gap-1">
              <p className="font-bold text-white">{head}</p>
              {links.map(([href, label]) => <Link key={href} href={href} className="inline-flex min-h-10 items-center text-white/75 underline-offset-4 hover:text-white hover:underline">{label}</Link>)}
              {head === appName && contact ? <a href={`mailto:${contact}`} className="inline-flex min-h-10 items-center text-white/75 underline-offset-4 hover:text-white hover:underline">Contact</a> : null}
            </nav>
          ))}
        </div>
        <div className="mx-auto max-w-[80rem] px-4 sm:px-6"><p className="border-t border-white/15 py-6 text-[14px] text-white/70">© {new Date().getFullYear()} {appName}</p></div>
      </footer>
    </div>
  );
}
