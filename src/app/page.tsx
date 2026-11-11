import type { Metadata } from "next";
import Link from "next/link";
import { ChromeMark } from "@/components/chrome-mark";
import { JsonLd } from "@/components/json-ld";
import { Doors } from "@/components/landing/doors";
import { NotifyForm } from "@/components/landing/notify-form";
import { TryDemo } from "@/components/landing/try-demo";
import { ArrowRight, BlueBlock, Questions, arrowLink, chapterTitle } from "@/components/landing/sections";
import { DashboardPicture, PhonePicture } from "@/components/landing/pictures";
import { Icon, Key, type IconName } from "@/components/marketing";
import { Reveal } from "@/components/reveal";
import { Splash } from "@/components/splash";
import { appLinks } from "@/config/app-links";
import { legalConfig } from "@/config/legal";
import { platformConfig } from "@/config/platform";
import { appCta } from "@/lib/audience";
import { siteOrigin } from "@/lib/request-origin";
import { charityFaqs, donorFaqs, withoutCostQuestions } from "@/lib/seo/faq";
import { organisationData } from "@/lib/seo/structured-data";

// The landing page (Yehuda, 10/11/2026): Givezy is coming, and a visitor picks one of two doors, "I give" or "I run a
// charity". Each door opens its short story in place (components/landing/doors.tsx), and each story leads on to its
// full page: For donors (/for-donors) and For charities (11/11/2026). Under the doors: who we are, why it's safe, and
// a few questions. Every claim here is one we can back today; nothing about fees until they are settled (Yehuda,
// 11/11/2026); the pictures are labelled samples.

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

function Point({ icon, title, body, tone }: { icon: IconName; title: string; body: string; tone: "brand" | "lilac" }) {
  return (
    <li className="flex gap-4">
      <span aria-hidden className={`mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone === "brand" ? "bg-brand-soft" : "bg-honey-soft"}`}>
        <Icon name={icon} className="stroke-brand" size={22} />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-display text-[1.25rem] font-bold leading-tight">{title}</span>
        <span className="text-[16px] leading-relaxed text-muted">{body}</span>
      </span>
    </li>
  );
}

/** One door's story: a title, three points and one button, with a sample picture beside it. */
function Story({ title, points, action, more, after, picture, tone }: { title: string; points: { icon: IconName; title: string; body: string }[]; action?: React.ReactNode; more: { href: string; label: string }; after?: React.ReactNode; picture: React.ReactNode; tone: "brand" | "lilac" }) {
  return (
    <div className="flex flex-col gap-10 pb-6 pt-8 md:gap-14 md:pt-14">
      <div className="grid items-center gap-10 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] md:gap-14">
        <div className="flex min-w-0 flex-col gap-7">
          <h2 data-panel-title tabIndex={-1} className="font-display text-[clamp(2rem,4vw,3rem)] font-extrabold leading-[1.05] tracking-[-0.02em] text-balance outline-none">{title}</h2>
          <ul className="flex flex-col gap-5">
            {points.map((p) => <Point key={p.title} {...p} tone={tone} />)}
          </ul>
          {action ? <div>{action}</div> : null}
          <Link href={more.href} className={arrowLink}>{more.label}<ArrowRight /></Link>
        </div>
        <div className="min-w-0">{picture}</div>
      </div>
      {after}
    </div>
  );
}

function GiveAction() {
  if (appLinks.launchListOpen) return <NotifyForm />;
  const app = appCta(appLinks);
  return (
    <div className="flex flex-col items-start gap-3">
      {app.kind === "stores" ? (
        <p className="flex flex-wrap gap-3">
          {app.stores.map((s) => (
            <a key={s.href} href={s.href} className="pressable inline-flex min-h-14 items-center rounded-[1.125rem] bg-coral px-7 text-[17px] font-bold text-navy">Get it on {s.label}</a>
          ))}
        </p>
      ) : (
        <>
          <p className="text-[17px] font-semibold">{appLinks.launchMonth ? `The app is coming to the App Store and Google Play in ${appLinks.launchMonth}.` : app.text}</p>
          <Link href="/charities" className="pressable inline-flex min-h-14 items-center rounded-[1.125rem] bg-brand px-7 text-[17px] font-bold text-brand-contrast">Give on the website now</Link>
        </>
      )}
    </div>
  );
}

/**
 * Who we are: the company only, no names or photos (Yehuda, 11/11/2026). DRAFT WORDING for Yehuda to approve, built
 * from the site's own lines ("Giving made easy", "Built to be trusted with money", "built for busy volunteers").
 */
function About() {
  return (
    <Reveal as="section" id="about" className="mx-auto max-w-[75rem] scroll-mt-24 px-4 py-14 sm:px-6 md:py-20">
      <div className="grid items-center gap-10 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:gap-16">
        <div className="flex min-w-0 flex-col items-start gap-5">
          <p className="text-[15px] font-bold text-brand">Who we are</p>
          <h2 className={chapterTitle}>A South African company, <Key>made for giving here</Key>.</h2>
          <p className="max-w-[34rem] text-[17px] leading-relaxed text-muted">
            {platformConfig.appName} exists because giving should be easy: find a charity you can trust, give in a few taps, and have your s18A receipt ready when tax time comes.
          </p>
          <p className="max-w-[34rem] text-[17px] leading-relaxed text-muted">
            And because the people who run South Africa&apos;s charities, many of them volunteers, should spend their time on their work, not on paperwork. So we do the receipts, the reminders and the record-keeping with them.
          </p>
        </div>
        <ul className="grid min-w-0 gap-4 sm:grid-cols-2">
          {([
            { icon: "heart", title: "For every cause", body: "Charities of every kind can list. Their own words are theirs." },
            { icon: "user", title: "For givers", body: "One account for every gift and every s18A receipt." },
            { icon: "building", title: "For charities", body: "Tools to get found, get given to and keep donors." },
            { icon: "shield", title: "Checked by people", body: "Every charity is reviewed by a person before it goes live." },
          ] as { icon: IconName; title: string; body: string }[]).map((p, i) => (
            <li key={p.title} className={`lift flex flex-col gap-3 rounded-[1.75rem] p-6 ${i === 0 || i === 3 ? "bg-honey-soft" : "bg-peach"}`}>
              <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-full bg-white">
                <Icon name={p.icon} className="stroke-brand" size={20} />
              </span>
              <h3 className="font-display text-[1.25rem] font-bold leading-tight">{p.title}</h3>
              <p className="text-[15px] leading-relaxed text-muted">{p.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </Reveal>
  );
}

export default function Home() {
  const contact = legalConfig.supportEmail;
  return (
    <div className="full-bleed overflow-x-clip">
      <ChromeMark kind="landing" />
      {origin() ? <JsonLd data={organisationData(origin())} /> : null}

      <header className="mx-auto flex h-16 max-w-[75rem] items-center justify-between gap-3 px-4 sm:h-20 sm:px-6">
        <Link href="/" aria-label={`${platformConfig.appName} home`} className="-ml-1.5 rounded-lg p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt={platformConfig.appName} width={97} height={32} className="h-8 w-auto sm:h-10" />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 whitespace-nowrap text-[15px] sm:gap-2">
          <Link href="/for-donors" className="inline-flex min-h-11 items-center rounded-full px-3 font-semibold text-navy underline-offset-4 hover:underline max-md:hidden">For donors</Link>
          <Link href="/for-charities" className="inline-flex min-h-11 items-center rounded-full px-3 font-semibold text-navy underline-offset-4 hover:underline max-md:hidden">For charities</Link>
          <Link href="/charities" className="inline-flex min-h-11 items-center rounded-full px-3 font-semibold text-navy underline-offset-4 hover:underline max-sm:hidden">Find a charity</Link>
          <Link href="/login" className="ml-1 inline-flex min-h-11 items-center rounded-full bg-brand px-4 font-semibold text-brand-contrast transition-colors hover:bg-navy">Sign in</Link>
        </nav>
      </header>

      <section className="relative">
        <span aria-hidden className="pointer-events-none absolute -left-40 -top-24 -z-10 h-[30rem] w-[30rem] rounded-full bg-honey-soft" />
        <span aria-hidden className="pointer-events-none absolute -right-24 top-40 -z-10 h-72 w-72 rounded-full bg-peach max-md:hidden" />
        <div className="mx-auto grid max-w-[75rem] items-center gap-6 px-4 pb-10 pt-6 sm:px-6 md:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] md:pb-16 md:pt-10">
          <div className="flex min-w-0 flex-col gap-5">
            <h1 className="font-display text-[clamp(3.25rem,10vw,7.5rem)] font-extrabold leading-[0.92] tracking-[-0.04em] text-balance">Giving, made easy.</h1>
            <p className="max-w-[34rem] text-[clamp(1.125rem,2vw,1.375rem)] leading-relaxed text-muted">One place to give to South African charities, and for charities to look after the people who give.</p>
            {appLinks.launchMonth ? (
              <p className="inline-flex w-fit items-center gap-2.5 rounded-full bg-honey-soft px-3.5 py-2 text-[14px] font-semibold text-navy sm:px-4 sm:text-[15px]">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-coral" />
                Launching in South Africa, {appLinks.launchMonth}.
              </p>
            ) : null}
          </div>
          <Splash className="splash-breathe order-first mx-auto w-[11rem] sm:w-[14rem] md:order-none md:w-full md:max-w-[22rem]" />
        </div>
      </section>

      <section aria-label="Choose your side" className="pb-16 md:pb-24">
        <Doors
          give={
            <Story
              tone="brand"
              title="Give in a few taps. Keep every receipt."
              points={[
                { icon: "repeat", title: "Once or every month", body: "Pick a charity and an amount. Pause or stop a monthly donation whenever you like." },
                { icon: "receipt", title: "Every s18A receipt in one place", body: "One s18A receipt a year from each charity that issues them, ready for your tax return." },
                { icon: "lock", title: "Your card stays private", body: "You type it on a secure payment page. Givezy never sees or stores it." },
              ]}
              more={{ href: "/for-donors", label: "See how giving works" }}
              after={
                <div className="flex max-w-[46rem] flex-col gap-7">
                  <TryDemo />
                  <GiveAction />
                </div>
              }
              picture={<PhonePicture />}
            />
          }
          charity={
            <Story
              tone="lilac"
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

      <About />

      <BlueBlock
        id="trust"
        kicker="Built to be trusted with money"
        title={<>Safe for donors. Simple for charities.</>}
        body={`${platformConfig.appName} is built so that money goes where it should, and personal details stay with the people they belong to.`}
        points={[
          { icon: "lock", title: "Your card stays private", body: `You pay on the payment provider's secure page. ${platformConfig.appName} never sees your card and never holds your money.` },
          { icon: "shield", title: "Every charity checked", body: "A person looks at each charity's registration documents and bank details before it can take a gift." },
          { icon: "receipt", title: "s18A receipts done properly", body: "One receipt a year from each charity that issues them, checked by the charity before it goes out." },
          { icon: "eye", title: "Your information is yours", body: "See and download everything we hold about you, and ask us to correct or delete it." },
        ]}
      />

      <Questions
        title={<>Good to <Key>know</Key>.</>}
        faqs={withoutCostQuestions([...donorFaqs.slice(0, 2), ...donorFaqs.filter((f) => /s18A|monthly|every month/i.test(f.q)), ...charityFaqs])}
        more={<Link href="/faq" className={arrowLink}>All questions<ArrowRight /></Link>}
      />

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[75rem] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-6 text-[14px] text-muted sm:px-6">
          <p>© {new Date().getFullYear()} {platformConfig.appName}</p>
          <nav aria-label="About Givezy" className="flex flex-wrap gap-x-5">
            <Link href="/for-donors" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-brand hover:underline">For donors</Link>
            <Link href="/for-charities" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-brand hover:underline">For charities</Link>
            <Link href="/privacy" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-brand hover:underline">Privacy</Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-brand hover:underline">Terms</Link>
            {contact ? (
              <a href={`mailto:${contact}`} className="inline-flex min-h-11 items-center underline-offset-4 hover:text-brand hover:underline">Contact</a>
            ) : (
              <Link href="/faq" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-brand hover:underline">Questions</Link>
            )}
          </nav>
        </div>
      </footer>
    </div>
  );
}
