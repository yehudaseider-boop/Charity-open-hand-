import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChromeMark } from "@/components/chrome-mark";
import { ArrowRight, Questions, arrowLink } from "@/components/landing/sections";
import { GoalPicture, PhonePicture } from "@/components/landing/pictures";
import { Icon, type IconName } from "@/components/marketing";
import { MobileMenu } from "@/components/mobile-menu";
import { Reveal } from "@/components/reveal";
import { Splash } from "@/components/splash";
import { appLinks } from "@/config/app-links";
import { legalConfig } from "@/config/legal";
import { platformConfig } from "@/config/platform";
import { charityFaqs, donorFaqs, withoutCostQuestions } from "@/lib/seo/faq";

// PREVIEW of the home page (Yehuda, 17/11/2026: "I like preview one... make sure it looks legit and the same as the
// reference... study it"), rebuilt after a close look at the reference site's layout, proportions and rhythm:
// restrained type (a 72 px headline in a regular weight, not a shout), one emphasised phrase per heading, strict
// dark and light bands, a hero with columns of tiles, a row of big numbers, a comparison table, generous space.
// Layout and rhythm only: no words, pictures or logos of the reference are used, and no client logos, quotes or
// figures exist here (we have none). Every line is wording already on the site; nothing about fees; the pictures
// are the site's labelled samples. Not linked, kept out of search results; the live home page is src/app/page.tsx.

export const metadata: Metadata = {
  title: { absolute: `${platformConfig.appName}: giving, made easy (preview)` },
  robots: { index: false, follow: false },
};

const appName = platformConfig.appName;

// Headings: regular-weight Bricolage with one phrase in its extra-bold and a second colour. The `!` beats the
// site's global heading rule (colour, weight, spacing), which is not inside a layer.
const sizeH1 = "text-[clamp(2.75rem,5.2vw,4.75rem)] leading-[1.04]";
const sizeH2 = "text-[clamp(2.25rem,4.2vw,3.75rem)] leading-[1.08]";
const sizeH3 = "text-[clamp(1.875rem,3.4vw,3rem)] leading-[1.1]";
function H({ as: Tag = "h2", size, dark = false, className = "", children }: { as?: "h1" | "h2" | "h3"; size: "h1" | "h2" | "h3"; dark?: boolean; className?: string; children: React.ReactNode }) {
  const s = size === "h1" ? sizeH1 : size === "h2" ? sizeH2 : sizeH3;
  return <Tag className={`font-display ${s} font-medium! tracking-[-0.03em]! text-balance ${dark ? "text-white!" : "text-indigo!"} ${className}`}>{children}</Tag>;
}
/** The one emphasised phrase in a heading. */
function Em({ dark = false, children }: { dark?: boolean; children: React.ReactNode }) {
  return <em className={`font-extrabold not-italic ${dark ? "text-honey" : "text-brand"}`}>{children}</em>;
}
/** A small label with a hairline above it, as the reference does. Sentence case, as the site's brand does. */
function Eyebrow({ dark = false, center = false, children }: { dark?: boolean; center?: boolean; children: React.ReactNode }) {
  return <p className={`w-full max-w-[24rem] border-t pt-3 text-[14px] font-semibold ${center ? "mx-auto text-center" : ""} ${dark ? "border-white/30 text-white/80" : "border-navy/20 text-muted"}`}>{children}</p>;
}

const orangeBtn = "pressable inline-flex min-h-12 items-center rounded-[1.125rem] bg-coral px-6 text-[16px] font-bold text-navy";
const inkBtn = "inline-flex min-h-12 items-center rounded-[1.125rem] bg-navy px-6 text-[16px] font-bold text-white transition-colors hover:bg-brand";
const lineBtn = "inline-flex min-h-12 items-center rounded-[1.125rem] border-[1.5px] border-navy/30 px-6 text-[16px] font-bold text-navy transition-colors hover:border-navy";
const lineBtnDark = "inline-flex min-h-12 items-center gap-1.5 rounded-[1.125rem] border-[1.5px] border-white/40 px-6 text-[16px] font-bold text-white transition-colors hover:border-white";

/* ---------- Hero tiles: real screens from the demo dashboard, in columns that drift ---------- */

// Cut from the real dashboard demo (/demo/dashboard) with its made-up sample data; see public/home/. Width and height
// are the picture's own, so the page doesn't jump while it loads and each column can drift at the same speed.
type Shot = { n: string; w: number; h: number };
const shots = {
  statMonth: { n: "stat-month", w: 540, h: 304 }, statYear: { n: "stat-year", w: 536, h: 304 }, statMonthly: { n: "stat-monthly", w: 536, h: 304 },
  needs: { n: "needs", w: 640, h: 247 }, chart: { n: "chart", w: 640, h: 359 }, sources: { n: "sources", w: 640, h: 822 },
  monthlyTop: { n: "monthly-top", w: 640, h: 128 }, donations: { n: "donations", w: 640, h: 287 }, campaigns: { n: "campaigns", w: 640, h: 329 },
  receiptsTop: { n: "receipts-top", w: 640, h: 128 }, receiptsList: { n: "receipts-list", w: 640, h: 289 },
  thankEditor: { n: "thank-editor", w: 640, h: 558 }, thankEmail: { n: "thank-email", w: 640, h: 606 },
} satisfies Record<string, Shot>;

const TILE_W = 248; // px, on large screens
const colA: Shot[] = [shots.statMonth, shots.chart, shots.needs, shots.donations, shots.statYear];
const colB: Shot[] = [shots.monthlyTop, shots.sources, shots.campaigns, shots.statMonthly, shots.receiptsTop];
const colC: Shot[] = [shots.thankEmail, shots.receiptsList, shots.thankEditor, shots.statMonth, shots.needs];

function TileImage({ shot, sizes = "260px" }: { shot: Shot; sizes?: string }) {
  return (
    <div className="overflow-hidden rounded-[1.1rem] border border-white/25 bg-white shadow-[0_18px_40px_rgba(6,22,70,0.35)]">
      <Image src={`/home/tile-${shot.n}.webp`} width={shot.w} height={shot.h} alt="" sizes={sizes} className="block h-auto w-full" />
    </div>
  );
}

/** One column of tiles, shown twice end to end so it can drift for ever; every column drifts at the same speed. */
function Column({ tiles, motion, className = "" }: { tiles: Shot[]; motion: "col-up" | "col-down"; className?: string }) {
  const total = tiles.reduce((sum, t) => sum + Math.round((TILE_W * t.h) / t.w) + 12, 0);
  const seconds = Math.round(total / 14);
  return (
    <div className={`min-w-0 ${className}`}>
      <div className={`flex flex-col gap-3 ${motion}`} style={{ animationDuration: `${seconds}s` }}>
        <div className="flex flex-col gap-3">{tiles.map((t, i) => <TileImage key={i} shot={t} />)}</div>
        <div className="flex flex-col gap-3">{tiles.map((t, i) => <TileImage key={i} shot={t} />)}</div>
      </div>
    </div>
  );
}

/** A real screen in a browser window. */
function BrowserFrame({ name, alt, className = "", fixedHeight }: { name: string; alt: string; className?: string; fixedHeight?: string }) {
  return (
    <div className={`overflow-hidden rounded-[1.25rem] border-[1.5px] border-border bg-white shadow-[0_40px_80px_rgba(14,27,61,0.16)] ${className}`}>
      <div className="flex h-9 items-center gap-1.5 border-b border-border bg-white px-4">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-honey" />
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-coral" />
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-brand" />
        <span className="mx-auto rounded-full bg-honey-soft px-4 py-0.5 text-[12px] font-semibold text-muted max-sm:hidden">Your {appName} dashboard</span>
      </div>
      <Image src={`/home/screen-${name}.webp`} width={1400} height={999} alt={alt} sizes="(min-width: 1024px) 640px, 92vw" className={`block w-full ${fixedHeight ? `${fixedHeight} object-cover object-top` : "h-auto"}`} />
    </div>
  );
}

/* ---------- Small pieces ---------- */

function Ticker({ words, reverse = false }: { words: string[]; reverse?: boolean }) {
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-10 pr-10 md:gap-14 md:pr-14">
      {words.map((w) => (
        <li key={w} className="shrink-0 font-display text-[clamp(1.375rem,2.4vw,2rem)] font-bold leading-none tracking-[-0.02em] text-navy/60">{w}</li>
      ))}
    </ul>
  );
  return (
    <div className="ticker overflow-hidden">
      <div className={`ticker-track flex w-max ${reverse ? "ticker-reverse" : ""}`}>{row(false)}{row(true)}</div>
    </div>
  );
}

function Check({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <li className="flex items-start gap-3 text-[17px] leading-relaxed">
      <span aria-hidden className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${dark ? "bg-white" : "bg-brand"}`}><Icon name="check" className={dark ? "stroke-brand" : "stroke-white"} size={12} /></span>
      <span>{children}</span>
    </li>
  );
}

function Frame({ tone, children, className = "" }: { tone: "white" | "lilac" | "peach"; children: React.ReactNode; className?: string }) {
  const bg = { white: "bg-white", lilac: "bg-honey-soft", peach: "bg-peach" }[tone];
  return <div className={`relative overflow-hidden rounded-[2rem] ${bg} ${className}`}>{children}</div>;
}

/** One or two real crops, one over the other, for a card. */
function Stacked({ a, b }: { a: [string, number, number]; b?: [string, number, number] }) {
  const img = ([n, w, h]: [string, number, number]) => <Image src={`/home/tile-${n}.webp`} width={w} height={h} alt="" sizes="380px" className="block h-auto w-full" />;
  const frame = "overflow-hidden rounded-[1.1rem] border-[1.5px] border-border bg-white shadow-[0_24px_50px_rgba(14,27,61,0.22)]";
  return (
    <div className="relative mx-auto w-full max-w-[23rem] pt-2">
      <div className={frame}>{img(a)}</div>
      {b ? <div className={`${frame} relative -mt-3 ml-10`}>{img(b)}</div> : null}
    </div>
  );
}

const comparison: [string, string, string][] = [
  ["s18A receipts", "Typed one by one", "Preview, then approve each one"],
  ["The SARS IT3(d) file", "Put together by hand", "Made for you from the same receipts"],
  ["Monthly donations", "Checked against the bank statement", "Tracked for you, and a declined card is tried again"],
  ["Thank-yous", "Written and sent one at a time", "Your words, sent to everyone who gave that month"],
  ["Who gave", "Spread across bank references and spreadsheets", "Every gift in one list"],
];

const footerGroups: [string, [string, string][]][] = [
  ["For donors", [["/charities", "Find a charity"], ["/for-donors", "How giving works"], ["/login", "Sign in"]]],
  ["For charities", [["/for-charities", "What charities get"], ["/apply", "Apply to list your charity"], ["/demo/dashboard", "Try the dashboard"]]],
  [appName, [["/faq", "Questions"], ["/privacy", "Privacy"], ["/terms", "Terms"]]],
];

export default function HomePreview() {
  const contact = legalConfig.supportEmail;
  const navLink = "inline-flex min-h-11 items-center rounded-full px-3 font-semibold text-white/90 underline-offset-4 hover:text-white hover:underline";
  return (
    <div className="full-bleed overflow-x-clip">
      <ChromeMark kind="landing" />

      {/* Navigation: stays at the top, blue, like the hero it sits on. */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-brand/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[80rem] items-center justify-between gap-3 px-4 sm:h-[4.5rem] sm:px-6">
          <Link href="/" aria-label={`${appName} home`} className="-ml-1.5 flex items-center rounded-full bg-white px-3 py-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt={appName} width={97} height={32} className="h-7 w-auto sm:h-8" />
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 whitespace-nowrap text-[15px] sm:gap-2">
            <span className="md:hidden [&_button]:bg-white [&_button]:text-navy">
              <MobileMenu items={[{ href: "/", label: "Home" }, { href: "/charities", label: "Find a charity" }, { href: "/for-donors", label: "For donors" }, { href: "/for-charities", label: "For charities" }]} />
            </span>
            <Link href="/for-donors" className={`${navLink} max-md:hidden`}>For donors</Link>
            <Link href="/for-charities" className={`${navLink} max-md:hidden`}>For charities</Link>
            <Link href="/charities" className={`${navLink} max-md:hidden`}>Find a charity</Link>
            <Link href="/login" className="ml-1 inline-flex min-h-11 items-center rounded-full bg-white px-4 font-semibold text-brand transition-colors hover:bg-honey-soft">Sign in</Link>
          </nav>
        </div>
      </header>

      {/* 1. Hero: dark blue, the promise on the left, real screens drifting up and down on the right. */}
      <section className="hero-glow relative overflow-hidden bg-brand text-white">
        <div className="mx-auto max-w-[80rem] px-4 sm:px-6 lg:min-h-[46rem]">
          <div className="flex min-w-0 flex-col items-start justify-center gap-7 py-14 lg:max-w-[44%] lg:py-28">
            {appLinks.launchMonth ? (
              <p className="inline-flex items-center gap-2.5 rounded-full bg-white/12 px-4 py-2 text-[14px] font-semibold text-white ring-1 ring-white/20">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-coral" />
                Launching in South Africa, {appLinks.launchMonth}.
              </p>
            ) : null}
            <H as="h1" size="h1" dark>
              Giving, <Em dark>made easy.</Em>
            </H>
            <p className="max-w-[30rem] text-[clamp(1.0625rem,1.5vw,1.25rem)] leading-relaxed text-white/85">
              One place to give to South African charities, and for charities to look after the people who give.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/charities" className={orangeBtn}>Find a charity</Link>
              <Link href="/for-charities" className={lineBtnDark}>I run a charity<ArrowRight /></Link>
            </div>
            <p className="max-w-[26rem] text-[13px] leading-relaxed text-white/80">The screens here are from our dashboard demo, with made-up names and figures.</p>
          </div>
        </div>
        <div aria-hidden className="tile-fade relative h-[26rem] overflow-hidden px-4 sm:px-6 lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[52%] lg:px-0">
          <div className="grid h-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(3,15.5rem)] lg:pl-4">
            <Column tiles={colA} motion="col-up" />
            <Column tiles={colB} motion="col-down" className="-mt-20" />
            <Column tiles={colC} motion="col-up" className="-mt-8 max-sm:hidden" />
          </div>
        </div>
      </section>

      {/* 2. A quiet band of what it does, in the place where the reference shows its customers' logos. */}
      <section aria-label={`What ${appName} does`} className="border-b border-border bg-white py-12 md:py-16">
        <p className="mx-auto max-w-[80rem] px-4 pb-7 text-center text-[15px] font-semibold text-muted sm:px-6">One place for giving, receipts and the people behind them</p>
        <div className="flex flex-col gap-5 md:gap-7">
          <Ticker words={["s18A receipts", "Once or every month", "Checked charities", "Thank-you notes", "A goal for the tax year", "QR posters", "Donor journeys"]} />
          <Ticker reverse words={["Campaigns", "The SARS IT3(d) file", "Monthly donations", "Give in someone's name", "Your team, each with the right access", "Downloads for your bookkeeper", "Two-step sign-in"]} />
        </div>
      </section>

      {/* 3. Why: a label, a heading, a paragraph, the product on the right. */}
      <section className="bg-white">
        <Reveal className="mx-auto grid max-w-[80rem] items-center gap-12 px-4 py-20 sm:px-6 md:grid-cols-2 md:gap-20 md:py-32">
          <div className="flex min-w-0 flex-col gap-7">
            <Eyebrow>Why {appName}</Eyebrow>
            <H size="h3">Giving should be easy, <Em>for everyone involved.</Em></H>
            <p className="max-w-[34rem] text-[clamp(1.0625rem,1.5vw,1.1875rem)] leading-relaxed text-muted">
              {appName} exists so you can find a charity you can trust, give in a few taps, and have your s18A receipt ready when tax time comes. And so the people who run South Africa&apos;s charities, many of them volunteers, can spend their time on their work, not on paperwork. We do the receipts, the reminders and the record-keeping with them.
            </p>
          </div>
          <div className="relative min-w-0 pb-10 md:pb-0">
            <span aria-hidden className="absolute -left-8 -top-8 -z-10 h-44 w-44 rounded-full bg-peach" />
            <span aria-hidden className="absolute -bottom-6 right-8 -z-10 h-28 w-28 rounded-full bg-honey/60" />
            <BrowserFrame name="overview" alt="The overview in the Givezy dashboard: what needs you this week, this month's total, and donations by month. Sample figures." />
            <div className="bob absolute -bottom-2 -left-3 w-[44%] max-w-[16rem] sm:-left-6 md:-bottom-8">
              <div className="overflow-hidden rounded-[1.1rem] border-[1.5px] border-border bg-white shadow-[0_24px_50px_rgba(14,27,61,0.22)]"><Image src="/home/tile-stat-month.webp" width={540} height={304} alt="" sizes="260px" className="block h-auto w-full" /></div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* 4. For donors: the picture on the left, the words on the right. */}
      <section className="bg-honey-soft">
        <Reveal className="mx-auto grid max-w-[80rem] items-center gap-12 px-4 py-20 sm:px-6 md:grid-cols-2 md:gap-20 md:py-32">
          <Frame tone="white" className="order-last px-5 py-10 sm:px-10 md:order-first md:py-14"><PhonePicture /></Frame>
          <div className="flex min-w-0 flex-col gap-7">
            <Eyebrow>For donors</Eyebrow>
            <H size="h3">Give in a few taps. <Em>Keep every receipt.</Em></H>
            <ul className="flex flex-col gap-3.5">
              <Check>Once or every month. Pause or stop a monthly donation whenever you like.</Check>
              <Check>One s18A receipt a year from each charity that issues them, ready for your tax return.</Check>
              <Check>Set a giving goal for the tax year, if you want one.</Check>
            </ul>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/for-donors" className={inkBtn}>See how giving works</Link>
              <Link href="/charities" className={lineBtn}>Find a charity</Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* 5. Dark band, three coloured cards. */}
      <section className="bg-brand text-white">
        <div className="mx-auto max-w-[80rem] px-4 py-20 sm:px-6 md:py-32">
          <Reveal className="mx-auto flex max-w-[52rem] flex-col items-center gap-7 text-center">
            <Eyebrow dark center>Simple tools</Eyebrow>
            <H size="h3" dark>Simple tools, <Em dark>made for giving here.</Em></H>
          </Reveal>
          <ul className="mt-14 grid gap-4 md:grid-cols-3">
            {([
              ["bg-coral text-navy", "Once or every month", "Pause, resume or stop from your account, whenever you like.", <Stacked key="m" a={["card-monthly-a", 514, 224]} b={["card-monthly-b", 972, 500]} />],
              ["bg-brand-deep text-white", "Thank-yous in your words", "Change the thank-you that goes with every gift, and send a personal one with a click.", <Stacked key="t" a={["thank-email", 640, 606]} />],
              ["bg-honey-soft text-navy", "s18A receipts, done for you", "Preview and approve each one. The SARS IT3(d) file is ready when you are.", <Stacked key="r" a={["card-receipts-a", 514, 224]} b={["card-receipts-b", 972, 516]} />],
            ] as [string, string, string, React.ReactNode][]).map(([tone, title, body, pic]) => (
              <li key={title} className={`lift flex min-h-[32rem] flex-col overflow-hidden rounded-[1.75rem] ${tone}`}>
                <div className="flex flex-col gap-2.5 p-7">
                  <h3 className={`font-display text-[clamp(1.5rem,2.2vw,1.875rem)] font-bold! leading-[1.1] tracking-[-0.02em]! ${tone.includes("text-white") ? "text-white!" : "text-navy!"}`}>{title}</h3>
                  <p className={`text-[16px] leading-relaxed ${tone.includes("text-white") ? "text-white/85" : "text-navy/80"}`}>{body}</p>
                </div>
                <div className="mt-auto h-[18rem] overflow-hidden px-6">{pic}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 6. A row of big facts, in the place where the reference shows its figures. Facts only, no invented numbers. */}
      <section className="bg-white">
        <Reveal className="mx-auto max-w-[80rem] px-4 py-20 sm:px-6 md:py-32">
          <div className="mx-auto flex max-w-[48rem] flex-col items-center gap-7 text-center">
            <Eyebrow center>Built to be trusted with money</Eyebrow>
            <H size="h2">Safe for donors. <Em>Simple for charities.</Em></H>
          </div>
          <ul className="mt-16 grid gap-10 md:grid-cols-3 md:gap-8">
            {([
              ["1", "s18A receipt a year from each charity that issues them, checked by the charity before it goes out."],
              ["0", "card details seen or stored by Givezy. You type your card on the payment provider's own page."],
              ["Every", "charity is looked at by a person: registration documents and bank details are checked before it can take a gift."],
            ] as [string, string][]).map(([big, text]) => (
              <li key={big} className="flex flex-col gap-4 border-t-2 border-navy/15 pt-6">
                <span className="font-display text-[clamp(4.5rem,9vw,7.5rem)] font-bold leading-[0.9] tracking-[-0.045em] text-brand">{big}</span>
                <span className="max-w-[22rem] text-[17px] leading-relaxed text-muted">{text}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* 7. Two dark story cards. */}
      <section className="bg-honey-soft">
        <div className="mx-auto max-w-[80rem] px-4 py-20 sm:px-6 md:py-28">
          <Eyebrow>For charities</Eyebrow>
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {([
              ["Write one thank-you. Everyone who gave that month gets it, with their own first name.", "See it in the dashboard", "/demo/dashboard"],
              ["Receipts without the February rush. Preview and approve each one, and the SARS IT3(d) file is ready when you are.", "See everything charities get", "/for-charities"],
            ] as [string, string, string][]).map(([title, link, href]) => (
              <li key={link}>
                <Link href={href} className="lift group flex min-h-[22rem] flex-col justify-between gap-10 rounded-[1.75rem] bg-brand p-7 text-white md:p-9">
                  <span className="inline-flex w-fit items-center rounded-full border border-white/40 px-3 py-1 text-[13px] font-semibold">Sample</span>
                  <span className="font-display text-[clamp(1.5rem,2.4vw,2rem)] font-bold leading-[1.15] tracking-[-0.02em] text-balance">{title}</span>
                  <span className="flex items-center justify-end gap-2 text-[15px] font-semibold text-white/90">{link}<span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full border border-white/40 transition-transform group-hover:rotate-90">+</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 8. What charities get, in three columns. */}
      <section className="bg-white">
        <Reveal className="mx-auto max-w-[80rem] px-4 py-20 sm:px-6 md:py-32">
          <div className="mx-auto flex max-w-[56rem] flex-col items-center gap-7 text-center">
            <Eyebrow center>What charities get</Eyebrow>
            <H size="h2">Everything you need to <Em>keep your donors.</Em></H>
          </div>
          <ul className="mt-16 grid gap-10 md:grid-cols-3 md:gap-8">
            {([
              ["receipt", "Receipts", ["Preview, then approve each one", "The SARS IT3(d) file, made for you", "Sent to your donors, and kept in their account"]],
              ["heart", "Donors", ["Thank-yous in your words", "Donor journeys: up to five emails you write", "See who to win back", "Bring your donors with you"]],
              ["building", "Your charity", ["A page donors trust", "Your page link, a button and a QR poster", "Your team, each with the right access", "Two-step sign-in"]],
            ] as [IconName, string, string[]][]).map(([icon, title, items]) => (
              <li key={title} className="flex flex-col gap-5 rounded-[1.75rem] border-[1.5px] border-border bg-white p-7">
                <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft"><Icon name={icon} className="stroke-brand" size={22} /></span>
                <h3 className="font-display text-[1.625rem] font-bold! leading-tight">{title}</h3>
                <ul className="flex flex-col gap-3 text-[16px] leading-snug text-muted">
                  {items.map((t) => <li key={t} className="flex gap-2.5 border-t border-border pt-3"><span aria-hidden className="mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />{t}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* 9. The work: real screens, in browser windows, with captions. */}
      <section className="bg-honey-soft">
        <div className="mx-auto max-w-[80rem] px-4 py-20 sm:px-6 md:py-32">
          <Reveal className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-6">
              <Eyebrow>Inside the dashboard</Eyebrow>
              <H size="h2">This is what <Em>charities see.</Em></H>
            </div>
            <Link href="/demo/dashboard" className={lineBtn}>Try the dashboard</Link>
          </Reveal>
          <ul className="mt-14 grid gap-x-5 gap-y-12 md:grid-cols-12">
            {([
              ["md:col-span-6", "overview", "Overview", "What needs you this week, this month's total and where gifts come from.", "The overview in the dashboard demo, with sample figures."],
              ["md:col-span-6", "thank", "Thank-yous", "Your own words go in every donor's email.", "The thank-you page in the dashboard demo, with a preview of what the donor gets."],
              ["md:col-span-4", "donations", "Every gift in one list", "Website, app, QR poster and the ones you record yourself.", "The donations list in the dashboard demo, with sample donors."],
              ["md:col-span-4", "monthly", "Monthly donations", "A declined card is tried again automatically.", "The monthly donations page in the dashboard demo."],
              ["md:col-span-4", "receipts", "s18A receipts", "The yearly list, ready for you to check and approve.", "The s18A receipts page in the dashboard demo."],
            ] as [string, string, string, string, string][]).map(([span, name, title, text, alt]) => (
              <li key={name} className={`flex flex-col gap-5 ${span}`}>
                <Reveal><BrowserFrame name={name} alt={alt} /></Reveal>
                <div className="flex flex-col gap-1">
                  <h3 className="font-display text-[1.375rem] font-bold! leading-tight">{title}<span className="ml-3 align-middle text-[13px] font-semibold text-muted">Sample</span></h3>
                  <p className="max-w-[28rem] text-[16px] leading-relaxed text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 10. The comparison, on a dark band. */}
      <section className="bg-brand text-white">
        <div className="mx-auto max-w-[80rem] px-4 py-20 sm:px-6 md:py-32">
          <Reveal className="mx-auto flex max-w-[52rem] flex-col items-center gap-7 text-center">
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
                  <p className="flex items-start gap-3 text-[16px] leading-relaxed text-white/75 md:py-6">
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

      {/* 11. Questions. */}
      <Questions
        title={<>Good to <em className="font-extrabold not-italic text-brand">know</em>.</>}
        faqs={withoutCostQuestions([...donorFaqs.slice(0, 2), ...donorFaqs.filter((f) => /s18A|monthly|every month/i.test(f.q)), ...charityFaqs])}
        more={<Link href="/faq" className={arrowLink}>All questions<ArrowRight /></Link>}
      />

      {/* 12. The app. */}
      <section className="bg-honey-soft">
        <Reveal className="mx-auto max-w-[80rem] px-4 py-20 sm:px-6 md:py-32">
          <div className="grid gap-10 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:items-end md:gap-20">
            <div className="flex flex-col gap-7">
              <Eyebrow>The app</Eyebrow>
              <H size="h2">One account for every gift. <Em>Built for the way you give.</Em></H>
            </div>
            <div className="flex flex-col gap-6">
              <p className="text-[17px] leading-relaxed text-muted">The same account as the website, so nothing is in two places.</p>
              <div className="flex flex-wrap gap-3">
                <Link href="/for-donors" className={inkBtn}>How it works</Link>
                <Link href="/charities" className={lineBtn}>Find a charity</Link>
              </div>
            </div>
          </div>
          <ul className="mt-12 grid gap-8 md:grid-cols-2">
            {([
              ["Causes you care about first", "Tell it what matters to you, and those charities show first.", <PhonePicture key="p" />],
              ["A goal for the tax year", "Set one if you like, and watch your giving add up. Skip it if you don't.", <GoalPicture key="g" />],
            ] as [string, string, React.ReactNode][]).map(([title, body, pic]) => (
              <li key={title} className="flex flex-col overflow-hidden rounded-[2rem] bg-white">
                <div className="flex flex-col gap-2 p-7 md:p-9">
                  <h3 className="font-display text-[1.5rem] font-bold! leading-tight">{title}</h3>
                  <p className="max-w-[26rem] text-[16px] leading-relaxed text-muted">{body}</p>
                </div>
                <div className="mt-auto h-[24rem] overflow-hidden px-6"><div className="origin-top scale-[0.95]">{pic}</div></div>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* 13. The close: the slogan, big, on dark. */}
      <section className="hero-glow relative overflow-hidden bg-brand text-white">
        <Reveal className="mx-auto flex max-w-[80rem] flex-col items-center gap-8 px-4 py-24 text-center sm:px-6 md:py-40">
          <Splash className="w-20 md:w-24" />
          <H size="h1" dark className="max-w-[56rem]">Giving, <Em dark>made easy.</Em></H>
          <p className="max-w-[32rem] text-[clamp(1.0625rem,1.5vw,1.25rem)] leading-relaxed text-white/85">Give to a checked charity in a few taps, or list yours and let the receipts take care of themselves.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/charities" className={orangeBtn}>Find a charity</Link>
            <Link href="/apply" className={lineBtnDark}>Apply to list your charity</Link>
          </div>
        </Reveal>
      </section>

      {/* 14. Footer, in columns, on the deep blue. */}
      <footer className="bg-brand-deep text-white">
        <div className="mx-auto grid max-w-[80rem] gap-10 px-4 py-14 text-[15px] sm:grid-cols-2 sm:px-6 md:grid-cols-4">
          <div className="flex flex-col gap-3">
            <Link href="/" aria-label={`${appName} home`} className="flex w-fit items-center rounded-full bg-white px-3 py-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt={appName} width={97} height={32} className="h-7 w-auto" />
            </Link>
            <p className="text-white/70">Giving, made easy.</p>
          </div>
          {footerGroups.map(([head, links]) => (
            <nav key={head} aria-label={head} className="flex flex-col gap-1">
              <p className="font-bold text-white">{head}</p>
              {links.map(([href, label]) => <Link key={href} href={href} className="inline-flex min-h-10 items-center text-white/75 underline-offset-4 hover:text-white hover:underline">{label}</Link>)}
              {head === appName && contact ? <a href={`mailto:${contact}`} className="inline-flex min-h-10 items-center text-white/75 underline-offset-4 hover:text-white hover:underline">Contact</a> : null}
            </nav>
          ))}
        </div>
        <p className="mx-auto max-w-[80rem] border-t border-white/15 px-4 py-6 text-[14px] text-white/65 sm:px-6">© {new Date().getFullYear()} {appName}</p>
      </footer>
    </div>
  );
}
