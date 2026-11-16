import type { Metadata } from "next";
import Link from "next/link";
import { ChromeMark } from "@/components/chrome-mark";
import { Doors } from "@/components/landing/doors";
import { TryDemo } from "@/components/landing/try-demo";
import { ArrowRight, BlueBlock, Questions, arrowLink } from "@/components/landing/sections";
import { CheckedPicture, DashboardPicture, GoalPicture, MonthlyPicture, PhonePicture, ReceiptPicture, SecurePagePicture, UpdatePicture } from "@/components/landing/pictures";
import { Icon, Key, type IconName } from "@/components/marketing";
import { MobileMenu } from "@/components/mobile-menu";
import { Reveal } from "@/components/reveal";
import { appLinks } from "@/config/app-links";
import { legalConfig } from "@/config/legal";
import { platformConfig } from "@/config/platform";
import { charityFaqs, donorFaqs, withoutCostQuestions } from "@/lib/seo/faq";

// A PREVIEW of the home page in a bolder, agency-style layout (Yehuda, 16/11/2026: "rebuild the home page in that
// style", after Superside's site). Not linked from anywhere and kept out of search results; the live home page is
// src/app/page.tsx until Yehuda chooses. Every line here is wording already on the site (home, For donors, For
// charities); nothing about fees; the pictures are the site's labelled samples.

export const metadata: Metadata = {
  title: { absolute: `${platformConfig.appName}: giving, made easy (preview)` },
  robots: { index: false, follow: false },
};

const appName = platformConfig.appName;

const donorWords = ["s18A receipts", "Once or every month", "Checked charities", "A goal for the tax year", "Give in someone's name", "Every gift in one place"];
const charityWords = ["s18A receipts, done for you", "Thank-you notes", "Donors who come back", "Campaigns with a goal", "QR posters", "Your team, each with the right access"];

/** A row of words that slides sideways for ever (still, and wrapped, for reduced motion). */
function Ticker({ words, reverse = false, tone }: { words: string[]; reverse?: boolean; tone: "ink" | "brand" }) {
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-6 pr-6 md:gap-10 md:pr-10">
      {words.map((w) => (
        <li key={w} className="flex shrink-0 items-center gap-6 md:gap-10">
          <span className={`font-display text-[clamp(1.75rem,4.5vw,3.5rem)] font-extrabold leading-none tracking-[-0.02em] ${tone === "brand" ? "text-brand" : "text-indigo"}`}>{w}</span>
          <span aria-hidden className={`h-3 w-3 shrink-0 rounded-full md:h-4 md:w-4 ${tone === "brand" ? "bg-coral" : "bg-honey"}`} />
        </li>
      ))}
    </ul>
  );
  return (
    <div className="ticker overflow-hidden">
      <div className={`ticker-track flex w-max ${reverse ? "ticker-reverse" : ""}`}>
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

/** One card in the feature grid: words on top, a sample picture cropped underneath. */
function Tile({ kicker, title, body, picture, tone, wide = false }: { kicker: string; title: string; body: string; picture: React.ReactNode; tone: "blue" | "lilac" | "peach" | "white"; wide?: boolean }) {
  const ground = { blue: "bg-brand text-brand-contrast", lilac: "bg-honey-soft", peach: "bg-peach", white: "border-[1.5px] border-border bg-white" }[tone];
  return (
    <li className={`lift group relative flex min-h-[30rem] flex-col overflow-hidden rounded-[2rem] ${ground} ${wide ? "md:col-span-2" : ""}`}>
      <div className="flex flex-col gap-2 p-7 md:p-8">
        <p className={`text-[14px] font-bold ${tone === "blue" ? "text-honey" : "text-brand"}`}>{kicker}</p>
        <h3 className={`font-display text-[clamp(1.5rem,2.6vw,2.125rem)] font-extrabold leading-[1.05] tracking-[-0.02em] text-balance ${tone === "blue" ? "text-white!" : "text-indigo"}`}>{title}</h3>
        <p className={`max-w-[30rem] text-[16px] leading-relaxed ${tone === "blue" ? "text-white/85" : "text-muted"}`}>{body}</p>
      </div>
      <div className="relative mt-auto h-[17rem] overflow-hidden px-6">
        <div className="origin-top scale-[0.82] transition-transform duration-500 group-hover:-translate-y-2 motion-reduce:transition-none">{picture}</div>
      </div>
    </li>
  );
}

function Step({ n, icon, title, body }: { n: string; icon: IconName; title: string; body: string }) {
  return (
    <li className="flex flex-col gap-4 border-t-2 border-border pt-6">
      <div className="flex items-center justify-between">
        <span className="font-display text-[clamp(3rem,6vw,4.5rem)] font-extrabold leading-none tracking-[-0.04em] text-honey">{n}</span>
        <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft">
          <Icon name={icon} className="stroke-brand" size={22} />
        </span>
      </div>
      <h3 className="font-display text-[1.5rem] font-extrabold leading-tight">{title}</h3>
      <p className="text-[16px] leading-relaxed text-muted">{body}</p>
    </li>
  );
}

function Point({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <span aria-hidden className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft">
        <Icon name={icon} className="stroke-brand" size={22} />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-display text-[1.25rem] font-bold leading-tight">{title}</span>
        <span className="text-[16px] leading-relaxed text-muted">{body}</span>
      </span>
    </li>
  );
}

function Story({ title, points, action, more, picture }: { title: string; points: { icon: IconName; title: string; body: string }[]; action?: React.ReactNode; more: { href: string; label: string }; picture: React.ReactNode }) {
  return (
    <div className="grid items-center gap-10 pb-6 pt-8 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] md:gap-14 md:pt-14">
      <div className="flex min-w-0 flex-col gap-7">
        <h2 data-panel-title tabIndex={-1} className="font-display text-[clamp(2rem,4vw,3rem)] font-extrabold leading-[1.05] tracking-[-0.02em] text-balance outline-none">{title}</h2>
        <ul className="flex flex-col gap-5">{points.map((p) => <Point key={p.title} {...p} />)}</ul>
        {action ? <div>{action}</div> : null}
        <Link href={more.href} className={arrowLink}>{more.label}<ArrowRight /></Link>
      </div>
      <div className="min-w-0">{picture}</div>
    </div>
  );
}

export default function HomePreview() {
  const contact = legalConfig.supportEmail;
  const navLink = "inline-flex min-h-11 items-center rounded-full px-3 font-semibold text-navy underline-offset-4 hover:underline";
  return (
    <div className="full-bleed overflow-x-clip">
      <ChromeMark kind="landing" />

      <header className="mx-auto flex h-16 max-w-[80rem] items-center justify-between gap-3 px-4 sm:h-20 sm:px-6">
        <Link href="/" aria-label={`${appName} home`} className="-ml-1.5 rounded-lg p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt={appName} width={97} height={32} className="h-8 w-auto sm:h-10" />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 whitespace-nowrap text-[15px] sm:gap-2">
          <MobileMenu items={[{ href: "/", label: "Home" }, { href: "/charities", label: "Find a charity" }, { href: "/for-donors", label: "For donors" }, { href: "/for-charities", label: "For charities" }]} />
          <Link href="/for-donors" className={`${navLink} max-md:hidden`}>For donors</Link>
          <Link href="/for-charities" className={`${navLink} max-md:hidden`}>For charities</Link>
          <Link href="/charities" className={`${navLink} max-sm:hidden`}>Find a charity</Link>
          <Link href="/login" className="ml-1 inline-flex min-h-11 items-center rounded-full bg-brand px-4 font-semibold text-brand-contrast transition-colors hover:bg-navy">Sign in</Link>
        </nav>
      </header>

      {/* 1. The promise, as big as it gets, then the product on a blue stage. */}
      <section className="relative px-4 pb-14 pt-8 sm:px-6 md:pb-20 md:pt-14">
        <span aria-hidden className="pointer-events-none absolute -left-48 -top-32 -z-10 h-[34rem] w-[34rem] rounded-full bg-honey-soft" />
        <span aria-hidden className="pointer-events-none absolute -right-32 top-24 -z-10 h-80 w-80 rounded-full bg-peach max-md:hidden" />
        <div className="mx-auto flex max-w-[80rem] flex-col items-center text-center">
          {appLinks.launchMonth ? (
            <p className="hero-rise mb-6 inline-flex items-center gap-2.5 rounded-full bg-honey-soft px-4 py-2 text-[14px] font-semibold text-navy sm:text-[15px]">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-coral" />
              Launching in South Africa, {appLinks.launchMonth}.
            </p>
          ) : null}
          <h1 className="font-display text-[clamp(3.75rem,13.5vw,11.5rem)] font-extrabold leading-[0.86] tracking-[-0.05em]">
            <span className="hero-rise block" style={{ animationDelay: "60ms" }}>Giving,</span>
            <span className="hero-rise block" style={{ animationDelay: "160ms" }}>made <span className="text-brand">easy.</span></span>
          </h1>
          <p className="hero-rise mt-7 max-w-[38rem] text-[clamp(1.125rem,2vw,1.4rem)] leading-relaxed text-muted" style={{ animationDelay: "260ms" }}>
            One place to give to South African charities, and for charities to look after the people who give.
          </p>
          <div className="hero-rise mt-8 flex flex-wrap justify-center gap-3" style={{ animationDelay: "340ms" }}>
            <Link href="/charities" className="pressable inline-flex min-h-14 items-center rounded-[1.125rem] bg-coral px-7 text-[17px] font-bold text-navy">Find a charity</Link>
            <Link href="/for-charities" className="pressable inline-flex min-h-14 items-center rounded-[1.125rem] border-[1.5px] border-border bg-white px-7 text-[17px] font-bold text-brand">I run a charity</Link>
          </div>
        </div>

        <div className="hero-rise relative mx-auto mt-12 max-w-[80rem] md:mt-16" style={{ animationDelay: "440ms" }}>
          <div className="relative overflow-hidden rounded-[2.5rem] bg-brand px-5 pb-0 pt-10 sm:px-10 md:px-16 md:pt-16">
            <span aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full border-[44px] border-honey/50" />
            <span aria-hidden className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-coral" />
            <span aria-hidden className="absolute left-[46%] top-10 h-5 w-5 rounded-full bg-honey max-md:hidden" />
            <div className="relative grid items-end gap-8 md:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
              <div className="translate-y-6 md:translate-y-10"><DashboardPicture /></div>
              <div className="max-md:hidden translate-y-10 md:translate-y-16"><PhonePicture /></div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Everything it does, sliding past. */}
      <section aria-label={`What ${appName} does`} className="flex flex-col gap-4 border-y border-border py-10 md:gap-6 md:py-14">
        <Ticker words={donorWords} tone="ink" />
        <Ticker words={charityWords} tone="brand" reverse />
      </section>

      {/* 3. One sentence, big. */}
      <Reveal as="section" className="mx-auto max-w-[80rem] px-4 py-20 sm:px-6 md:py-32">
        <p className="text-[15px] font-bold text-brand">Why {appName}</p>
        <p className="mt-5 max-w-[68rem] font-display text-[clamp(2.25rem,5.6vw,4.75rem)] font-extrabold leading-[1.02] tracking-[-0.035em] text-balance">
          Giving should be easy: find a charity you can <Key>trust</Key>, give in a few taps, and have your <Key>s18A receipt</Key> ready when tax time comes.
        </p>
      </Reveal>

      {/* 4. Two sides, one place: the doors from the live home page. */}
      <section aria-label="Choose your side" className="pb-16 md:pb-24">
        <Doors
          give={
            <Story
              title="Give in a few taps. Keep every receipt."
              points={[
                { icon: "repeat", title: "Once or every month", body: "Pick a charity and an amount. Pause or stop a monthly donation whenever you like." },
                { icon: "receipt", title: "Every s18A receipt in one place", body: "One s18A receipt a year from each charity that issues them, ready for your tax return." },
                { icon: "chart", title: "Goals, streaks and a record", body: "Set a giving goal for the tax year, watch your ring fill, and see your months in a row of giving." },
              ]}
              action={<TryDemo />}
              more={{ href: "/for-donors", label: "See how giving works" }}
              picture={<PhonePicture />}
            />
          }
          charity={
            <Story
              title="Get found, get given to, keep your donors."
              points={[
                { icon: "receipt", title: "s18A receipts, done for you", body: "Preview and approve each one. The SARS IT3(d) file is ready when you are." },
                { icon: "heart", title: "Donors who come back", body: "Thank-you notes, short email journeys, and a clear list of who stopped giving." },
                { icon: "user", title: "Your team, each with the right access", body: "Owner, admin, finance, fundraiser or viewer." },
              ]}
              action={<Link href="/apply" className="pressable inline-flex min-h-14 items-center rounded-[1.125rem] bg-coral px-7 text-[17px] font-bold text-navy">Apply to list your charity</Link>}
              more={{ href: "/for-charities", label: "See everything charities get" }}
              picture={<DashboardPicture />}
            />
          }
        />
      </section>

      {/* 5. The feature grid. */}
      <section className="mx-auto max-w-[80rem] px-4 pb-20 sm:px-6 md:pb-28">
        <Reveal className="flex flex-col gap-4 pb-10 md:flex-row md:items-end md:justify-between">
          <h2 className="max-w-[42rem] font-display text-[clamp(2.25rem,5vw,4rem)] font-extrabold leading-[1] tracking-[-0.035em] text-balance">
            Everything in <Key>one place</Key>.
          </h2>
          <Link href="/for-charities" className={arrowLink}>See everything charities get<ArrowRight /></Link>
        </Reveal>
        <ul className="grid gap-5 md:grid-cols-3">
          <Tile wide tone="blue" kicker="For charities" title="s18A receipts, done for you" body="Preview and approve each one. The SARS IT3(d) file is ready when you are." picture={<ReceiptPicture />} />
          <Tile tone="lilac" kicker="For donors" title="Once or every month" body="Pause, resume or stop from your account, whenever you like. Nobody to phone, no form to fill in." picture={<MonthlyPicture />} />
          <Tile tone="peach" kicker="Checked charities" title="Every charity checked" body="A person looks at each charity's registration documents and bank details before it can take a gift." picture={<CheckedPicture />} />
          <Tile wide tone="lilac" kicker="The app" title="A goal for the tax year" body="Set one if you like, and watch your giving add up. Skip it if you don't." picture={<GoalPicture />} />
          <Tile tone="white" kicker="Your card" title="Your card stays private" body={`You type it on the provider's own page. ${appName} never sees or stores it.`} picture={<SecurePagePicture />} />
          <Tile wide tone="peach" kicker="For charities" title="Donors who come back" body="Thank-you notes, short email journeys, and a clear list of who stopped giving." picture={<UpdatePicture />} />
        </ul>
      </section>

      {/* 6. How giving works, in four numbered steps. */}
      <Reveal as="section" className="mx-auto max-w-[80rem] px-4 pb-20 sm:px-6 md:pb-28">
        <p className="text-[15px] font-bold text-brand">How it works</p>
        <h2 className="mt-3 max-w-[42rem] font-display text-[clamp(2.25rem,5vw,4rem)] font-extrabold leading-[1] tracking-[-0.035em] text-balance">Four steps. <Key>That&apos;s it.</Key></h2>
        <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <Step n="01" icon="search" title="Find a charity" body="Search by name, cause or area. Every charity is checked by a person before it can take a gift." />
          <Step n="02" icon="heart" title="Pick an amount" body="Give once, or every month. Add someone's name if the gift is in their memory or honour." />
          <Step n="03" icon="lock" title="Pay on a secure page" body={`You type your card on the payment provider's own page. ${appName} never sees it.`} />
          <Step n="04" icon="receipt" title="Keep the record" body="Every gift lands in your account, with your s18A receipt once the tax year ends." />
        </ol>
      </Reveal>

      {/* 7. Trust, on a blue block (the live home page's own section). */}
      <BlueBlock
        id="trust"
        kicker="Built to be trusted with money"
        title={<>Safe for donors. Simple for charities.</>}
        body={`${appName} is built so that money goes where it should, and personal details stay with the people they belong to.`}
        points={[
          { icon: "lock", title: "Your card stays private", body: `You pay on the payment provider's secure page. ${appName} never sees your card and never holds your money.` },
          { icon: "shield", title: "Every charity checked", body: "A person looks at each charity's registration documents and bank details before it can take a gift." },
          { icon: "receipt", title: "s18A receipts done properly", body: "One receipt a year from each charity that issues them, checked by the charity before it goes out." },
          { icon: "eye", title: "Your information is yours", body: "See and download everything we hold about you, and ask us to correct or delete it." },
        ]}
      />

      {/* 8. The closing band. */}
      <section className="px-4 py-16 sm:px-6 md:py-24">
        <Reveal className="relative mx-auto max-w-[80rem] overflow-hidden rounded-[2.5rem] bg-honey-soft px-6 py-16 text-center sm:px-10 md:py-24">
          <span aria-hidden className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-peach" />
          <span aria-hidden className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full border-[40px] border-honey/60" />
          <div className="relative flex flex-col items-center gap-6">
            <h2 className="max-w-[56rem] font-display text-[clamp(2.75rem,8vw,6.5rem)] font-extrabold leading-[0.92] tracking-[-0.045em] text-balance">Ready when <span className="text-brand">you are.</span></h2>
            <p className="max-w-[34rem] text-[clamp(1.0625rem,1.8vw,1.25rem)] leading-relaxed text-muted">Give to a checked charity in a few taps, or list yours and let the receipts take care of themselves.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/charities" className="pressable inline-flex min-h-14 items-center rounded-[1.125rem] bg-coral px-7 text-[17px] font-bold text-navy">Find a charity</Link>
              <Link href="/apply" className="pressable inline-flex min-h-14 items-center rounded-[1.125rem] bg-brand px-7 text-[17px] font-bold text-brand-contrast">Apply to list your charity</Link>
            </div>
          </div>
        </Reveal>
      </section>

      <Questions
        title={<>Good to <Key>know</Key>.</>}
        faqs={withoutCostQuestions([...donorFaqs.slice(0, 2), ...donorFaqs.filter((f) => /s18A|monthly|every month/i.test(f.q)), ...charityFaqs])}
        more={<Link href="/faq" className={arrowLink}>All questions<ArrowRight /></Link>}
      />

      {/* 9. Footer with the slogan, big. */}
      <footer className="overflow-hidden border-t border-border">
        <div className="mx-auto flex max-w-[80rem] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 pt-8 text-[14px] text-muted sm:px-6">
          <p>© {new Date().getFullYear()} {appName}</p>
          <nav aria-label={`About ${appName}`} className="flex flex-wrap gap-x-5">
            <Link href="/for-donors" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-brand hover:underline">For donors</Link>
            <Link href="/for-charities" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-brand hover:underline">For charities</Link>
            <Link href="/privacy" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-brand hover:underline">Privacy</Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-brand hover:underline">Terms</Link>
            {contact ? <a href={`mailto:${contact}`} className="inline-flex min-h-11 items-center underline-offset-4 hover:text-brand hover:underline">Contact</a> : <Link href="/faq" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-brand hover:underline">Questions</Link>}
          </nav>
        </div>
        <p aria-hidden className="mx-auto max-w-[80rem] select-none px-4 pb-2 pt-6 font-display text-[clamp(3.5rem,11vw,10rem)] font-extrabold leading-[0.85] tracking-[-0.05em] text-honey-soft sm:px-6 md:whitespace-nowrap">
          Giving made easy.
        </p>
      </footer>
    </div>
  );
}
