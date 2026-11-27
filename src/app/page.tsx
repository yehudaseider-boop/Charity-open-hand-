import type { Metadata } from "next";
import Link from "next/link";
import { ChromeMark } from "@/components/chrome-mark";
import { HeaderNav } from "@/components/header-nav";
import { JsonLd } from "@/components/json-ld";
import { Illustration } from "@/components/illustration";
import { ArrowRight, Questions, arrowLink } from "@/components/landing/sections";
import { PhonePicture } from "@/components/landing/pictures";
import { LiveWindow } from "@/components/live-window";
import { TryAGift } from "@/components/landing/try-a-gift";
import { Icon, type IconName } from "@/components/marketing";
import { Reveal } from "@/components/reveal";
import { Splash } from "@/components/splash";
import { Screen } from "@/components/landing/gift-story";
import { appLinks } from "@/config/app-links";
import { legalConfig } from "@/config/legal";
import { platformConfig } from "@/config/platform";
import { DEMO_CHARITY } from "@/app/demo/dashboard/sample";
import { siteOrigin } from "@/lib/request-origin";
import { charityFaqs, donorFaqs, withoutCostQuestions } from "@/lib/seo/faq";
import { organisationData } from "@/lib/seo/structured-data";

// The home page (Yehuda, 17/11/2026: "I love it", then "everything connected and synced"). Redesigned 26/11/2026
// (Yehuda: "Loving it"): the hero's phone is real to tap (TryAGift), two full-width doors, bolder sections. Planned from what a visitor
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
  return <Tag className={`font-display ${size === "h1" ? sizeH1 : sizeH2} font-bold! tracking-[-0.03em]! text-balance ${dark ? "text-white!" : "text-indigo!"} ${className}`}>{children}</Tag>;
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

/* ---------- Small pieces ---------- */

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-4 border-t-2 border-navy/10 pt-5">
      <span aria-hidden className="font-display text-[3.5rem] font-extrabold leading-[0.8] tracking-[-0.05em] text-brand">{n}</span>
      <span className="flex flex-col gap-1">
        <span className="font-display text-[1.375rem] font-bold leading-tight">{title}</span>
        <span className="text-[16px] leading-relaxed text-muted">{body}</span>
      </span>
    </li>
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

export default function HomePage() {
  const contact = legalConfig.supportEmail;
  return (
    <div className="full-bleed overflow-x-clip">
      <ChromeMark kind="landing" />
      {origin() ? <JsonLd data={organisationData(origin())} /> : null}

      <header className="sticky top-0 z-50 border-b border-white/10 bg-brand/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[80rem] items-center justify-between gap-3 px-4 sm:h-[4.5rem] sm:px-6">
          <Link href="/" aria-label={`${appName} home`} className="-ml-1.5 flex items-center rounded-full bg-white px-3 py-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-400.png" alt={appName} width={97} height={32} className="h-7 w-auto sm:h-8" />
          </Link>
          <HeaderNav tone="dark" />
        </div>
      </header>

      {/* 1. Hero: the promise on the left; on the right, one gift's story with a phone that is real to tap. */}
      <section className="relative overflow-hidden bg-brand text-white">
        <span aria-hidden className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full border-[40px] border-honey/20" />
        <div className="relative mx-auto grid max-w-[80rem] items-center gap-12 px-4 pb-14 pt-12 sm:px-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] xl:gap-8 lg:py-20">
          <div className="flex min-w-0 flex-col items-start gap-7">
            {appLinks.launchMonth ? (
              <p className="inline-flex items-center gap-2.5 rounded-full bg-white/12 px-4 py-2 text-[14px] font-semibold text-white ring-1 ring-white/20">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-coral" />
                Coming {appLinks.launchMonth}
              </p>
            ) : null}
            <h1 className="font-display text-[clamp(3.25rem,6.2vw,6rem)] font-extrabold! leading-[0.92] tracking-[-0.045em]! text-white!">
              Giving,
              <br />
              <span className="whitespace-nowrap text-honey">made easy.</span>
            </h1>
            <p className="max-w-[30rem] text-pretty text-[clamp(1.0625rem,1.5vw,1.25rem)] leading-relaxed text-white/85">
              Give to a charity a real person has checked, in a few taps. Every gift and every s18A receipt stays in one place, ready for tax time.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/charities" className={orangeBtn}>Find a charity</Link>
              <Link href="#charities" className={lineBtnDark}>I run a charity<ArrowRight /></Link>
            </div>
          </div>
          <TryAGift charity={charity} />
        </div>
        <p className="relative mx-auto max-w-[80rem] px-4 pb-8 text-[13px] text-white/80 sm:px-6">Made-up example. {charity} is sample data from our dashboard demo.</p>
      </section>

      {/* 2. Two doors: the page splits in two, and each half is one big door. */}
      <section aria-label="Who Givezy is for" className="grid lg:grid-cols-2">
        {([
          ["bg-honey-soft", "I give", "Find a charity you trust, give once or every month, and keep every s18A receipt in one account.", "/charities", "Find a charity", "loveIt", "hearts"],
          ["bg-peach", "I run a charity", "Get found and given to, thank every donor, and let the receipts and the record-keeping take care of themselves.", "/for-charities", "What charities get", "workingTogether", "stars"],
        ] as const).map(([bg, title, body, href, cta, art, sparkle]) => (
          <Link key={title} href={href} className={`group relative flex min-h-[22rem] flex-col justify-between gap-10 overflow-hidden px-6 py-12 focus-visible:outline-3 focus-visible:-outline-offset-8 focus-visible:outline-brand sm:px-10 lg:min-h-[30rem] lg:px-14 lg:py-20 ${bg}`}>
            <div className="flex max-w-[32rem] flex-col gap-4">
              <span className="font-display text-[clamp(2.75rem,4.8vw,4.25rem)] font-extrabold leading-[0.95] tracking-[-0.04em] text-indigo">{title}</span>
              <span className="text-[17px] leading-relaxed text-navy/80">{body}</span>
            </div>
            <div className="flex items-end justify-between gap-4">
              <span className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-[1.125rem] bg-navy px-6 text-[16px] font-bold text-white transition-colors group-hover:bg-brand">
                {cta}<ArrowRight />
              </span>
              <Illustration name={art} sparkle={sparkle} className="w-24 shrink sm:w-36 lg:w-44" />
            </div>
          </Link>
        ))}
      </section>

      {/* 3. For donors: three steps, and the phone. */}
      <section id="donors" className="scroll-mt-20 bg-white">
        <Reveal className="mx-auto grid max-w-[80rem] items-center gap-14 px-4 py-20 sm:px-6 md:grid-cols-2 md:gap-20 md:py-28">
          <div className="flex min-w-0 flex-col gap-8">
            <Eyebrow>For donors</Eyebrow>
            <H size="h2">Give in a few taps. <Em>Keep every receipt.</Em></H>
            <ol className="flex flex-col gap-7">
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
              phoneGround="soft"
              onBlue
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

      {/* 5. Big facts, no invented numbers: three colour blocks, each with a dot bleeding off its corner. */}
      <section className="bg-white">
        <Reveal className="mx-auto max-w-[80rem] px-4 py-20 sm:px-6 md:py-28">
          <div className="mx-auto flex max-w-[48rem] flex-col items-center gap-6 text-center">
            <Eyebrow center>Built to be trusted with money</Eyebrow>
            <H size="h2">Safe for donors. <Em>Simple for charities.</Em></H>
          </div>
          <ul className="mt-14 grid gap-5 md:grid-cols-3">
            {([
              ["0", "rand of a gift passes through Givezy's bank account. Gifts go straight to the charity's own account.", "bg-brand text-white", "text-white", "text-white/85", "bg-coral"],
              ["1", "s18A receipt a year from each charity that issues them, checked by the charity before it goes out.", "bg-honey-soft text-navy", "text-brand", "text-navy/80", "bg-peach"],
              ["100%", "of charities are looked at by a person: registration documents and bank details are checked before they can take a gift.", "bg-peach text-navy", "text-brand", "text-navy/80", "bg-honey"],
            ] as [string, string, string, string, string, string][]).map(([big, text, ground, bigTone, textTone, dotTone]) => (
              <li key={big} className={`relative flex flex-col justify-between gap-8 overflow-hidden rounded-[2rem] p-8 md:min-h-[20rem] md:p-9 ${ground}`}>
                <span aria-hidden className={`absolute -right-5 -top-5 h-14 w-14 rounded-full ${dotTone}`} />
                <span className={`relative font-display text-[clamp(5rem,9vw,8rem)] font-extrabold leading-[0.85] tracking-[-0.05em] ${bigTone}`}>{big}</span>
                <span className={`relative max-w-[22rem] text-[17px] leading-relaxed ${textTone}`}>{text}</span>
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

      {/* 8. The close: the hero's two-line headline, and the same two doors. */}
      <section className="relative overflow-hidden bg-brand text-white">
        <span aria-hidden className="absolute -right-24 -top-24 h-80 w-80 rounded-full border-[48px] border-honey/20" />
        <span aria-hidden className="absolute -bottom-14 left-[12%] h-32 w-32 rounded-full bg-coral" />
        <Reveal className="relative mx-auto flex max-w-[80rem] flex-col items-start gap-8 px-4 pb-32 pt-24 sm:px-6 md:pb-40 md:pt-32">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-[0_20px_50px_rgba(6,22,70,0.35)] md:h-24 md:w-24"><Splash className="w-12 md:w-14" /></span>
          <h2 className="font-display text-[clamp(3rem,6.6vw,6.25rem)] font-extrabold! leading-[0.92] tracking-[-0.045em]! text-white!">
            January is close.
            <br />
            <span className="text-honey">Be there from day one.</span>
          </h2>
          <p className="max-w-[34rem] text-[clamp(1.0625rem,1.5vw,1.25rem)] leading-relaxed text-white/85">Find a charity you trust and give in a few taps, or list yours and let the receipts take care of themselves.</p>
          <div className="flex flex-wrap gap-3">
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
              <img src="/brand/logo-400.png" alt={appName} width={97} height={32} className="h-7 w-auto" />
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
