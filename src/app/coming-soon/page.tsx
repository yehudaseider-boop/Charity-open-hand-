import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChromeMark } from "@/components/chrome-mark";
import { GivePhone, NewGift, Receipt, Screen, Where, storyCard } from "@/components/landing/gift-story";
import { NotifyForm } from "@/components/landing/notify-form";
import { ArrowRight, Questions } from "@/components/landing/sections";
import { LiveWindow } from "@/components/live-window";
import { Icon } from "@/components/marketing";
import { Reveal } from "@/components/reveal";
import { Splash } from "@/components/splash";
import { DEMO_CHARITY } from "@/app/demo/dashboard/sample";
import { appLinks, charitySignUpOpen, launchListOpen } from "@/config/app-links";
import { legalConfig } from "@/config/legal";
import { platformConfig } from "@/config/platform";
import { whatsAppChat } from "@/lib/whatsapp";

// The public address's page until launch (givezy.co.za; see lib/coming-soon.ts and proxy.ts). Rebuilt 19/11/2026
// (Yehuda: "make it awesome and super legit"), from what the best pre-launch pages do: show the product in the first
// screen, put both asks where the eye lands, tell one gift's story, give charities an honest reason to apply now, and
// make it easy to ask a person. Two ways in only: "Notify me at launch" for givers (when LAUNCH_LIST=yes) and
// "Apply to list your charity". The demo dashboard, Privacy and Terms are also open on this address. No charity list,
// no giving. Nothing about fees or invented numbers; every screen is the dashboard demo's made-up sample data.
// DRAFT WORDING for Yehuda to approve. Never listed by search engines: robots below is set on the page itself.

const appName = platformConfig.appName;
const charity = DEMO_CHARITY.name_en;
const launch = appLinks.launchMonth;

export const metadata: Metadata = {
  title: { absolute: `${appName}: giving, made easy` },
  description: `${appName} is a South African giving platform, launching ${launch ?? "soon"}. Give to checked charities and keep every s18A receipt in one place. For charities: s18A receipts, thank-yous and the tools to keep their donors.`,
  robots: { index: false, follow: false },
};

const orangeBtn = "pressable inline-flex min-h-13 items-center justify-center rounded-[1.125rem] bg-coral px-7 text-[17px] font-bold text-navy";
const lineBtnDark = "whitespace-nowrap inline-flex min-h-13 items-center justify-center gap-1.5 rounded-[1.125rem] border-[1.5px] border-white/40 px-7 text-[17px] font-bold text-white transition-colors hover:border-white";
const lineBtn = "inline-flex min-h-13 items-center justify-center gap-1.5 rounded-[1.125rem] border-[1.5px] border-navy/25 px-7 text-[17px] font-bold text-navy transition-colors hover:border-navy";

function H2({ dark = false, children }: { dark?: boolean; children: React.ReactNode }) {
  return <h2 className={`font-display text-[clamp(2.25rem,4.2vw,3.75rem)] font-medium! leading-[1.08] tracking-[-0.03em]! text-balance ${dark ? "text-white!" : "text-indigo!"}`}>{children}</h2>;
}
function Em({ dark = false, children }: { dark?: boolean; children: React.ReactNode }) {
  return <em className={`font-extrabold not-italic ${dark ? "text-honey" : "text-brand"}`}>{children}</em>;
}
function Eyebrow({ dark = false, children }: { dark?: boolean; children: React.ReactNode }) {
  return <p className={`w-full max-w-[24rem] border-t pt-3 text-[14px] font-semibold ${dark ? "border-white/30 text-white/80" : "border-navy/20 text-muted"}`}>{children}</p>;
}

/** WhatsApp's own mark, drawn simply, in the colour of the text around it. */
function WhatsAppMark({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.4 3.9c1.6.7 2.3.7 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.7-.3Z" />
    </svg>
  );
}

const QUESTIONS = [
  {
    q: "When does Givezy launch?",
    a: launch ? `In ${launch}, in South Africa. Leave your email and we'll tell you the day it opens.` : "Soon, in South Africa. Leave your email and we'll tell you the day it opens.",
  },
  {
    q: "Which charities can join?",
    a: "South African charities with an NPO or PBO number and a bank account in the organisation's name. s18A receipts are for charities SARS has approved to issue them. A person on our team reads every application and checks the documents and bank details.",
  },
  {
    q: "Where does my money go?",
    a: `Straight to the charity. ${appName} holds none of a charity's gift: it is paid to the charity, not to us.`,
  },
  {
    q: "What does it cost?",
    a: "We'll publish our fees before launch, in plain Rand. Joining the launch list or applying to list your charity costs nothing.",
  },
];

export default function ComingSoon() {
  const email = legalConfig.supportEmail;
  const whatsApp = whatsAppChat(legalConfig.supportWhatsApp, `Hi ${appName}, I have a question.`);
  const listOpen = launchListOpen();
  // Until charities can apply on the live site, every charity button opens a WhatsApp chat (see charitySignUpOpen).
  const applyOpen = charitySignUpOpen();
  const charityChat = whatsAppChat(legalConfig.supportWhatsApp, `Hi ${appName}, I run a charity and would like to join.`);
  const charityHref = applyOpen || !charityChat ? "/apply" : charityChat;
  const external = !applyOpen && Boolean(charityChat);
  const ext = external ? { target: "_blank", rel: "noopener noreferrer" } : {};

  return (
    <div className="full-bleed overflow-x-clip">
      <ChromeMark kind="landing" />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-brand/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[80rem] items-center justify-between gap-3 px-4 sm:h-[4.5rem] sm:px-6">
          {/* Not a link: this is the only page. */}
          <span className="-ml-1.5 flex items-center rounded-full bg-white px-3 py-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt={appName} width={97} height={32} className="h-7 w-auto sm:h-8" />
          </span>
          <nav aria-label="Get started" className="flex items-center gap-1 sm:gap-2">
            {whatsApp ? (
              <a href={whatsApp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[15px] font-semibold text-white hover:bg-white/10">
                <WhatsAppMark />
                <span className="max-sm:sr-only">Chat to us</span>
              </a>
            ) : null}
            <a href="#join" className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-[15px] font-bold text-brand hover:bg-honey-soft">For charities</a>
          </nav>
        </div>
      </header>

      {/* 1. Hero: the promise and both ways in, with one gift's story beside it. */}
      <section className="hero-glow relative overflow-hidden bg-brand text-white">
        <div className="mx-auto grid max-w-[80rem] items-center gap-12 px-4 pb-14 pt-12 sm:px-6 xl:min-h-[44rem] xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] xl:gap-6 xl:py-20">
          <div className="flex min-w-0 flex-col items-start gap-7">
            <p className="inline-flex items-center gap-2.5 rounded-full bg-white/12 px-4 py-2 text-[14px] font-semibold text-white ring-1 ring-white/20">
              <span aria-hidden className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-coral" />
              </span>
              {launch ? `Launching in South Africa, ${launch}` : "Coming soon to South Africa"}
            </p>
            <h1 className="font-display text-[clamp(3rem,6vw,5.25rem)] font-medium! leading-[1.02] tracking-[-0.035em]! text-balance text-white!">
              Giving, <Em dark>made easy.</Em>
            </h1>
            <p className="max-w-[32rem] text-pretty text-[clamp(1.0625rem,1.5vw,1.25rem)] leading-relaxed text-white/85">
              Give to South African charities you can trust, in a few taps, and never chase an s18A receipt again. For charities: every gift, every donor and every receipt in one place.
            </p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <a href="#join" className={orangeBtn}>{listOpen ? "Get early access" : "I give"}</a>
              <a href="#join" className={lineBtnDark}>I run a charity<ArrowRight /></a>
            </div>
          </div>

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
                    <div className={`${storyCard} overflow-hidden p-1.5`}><Image src="/home/email-v5.webp" width={1056} height={868} alt="" unoptimized priority className="block h-auto w-full rounded-[1rem]" /></div>
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

      {/* 2. The two ways in, side by side. */}
      <section id="join" className="scroll-mt-20 bg-white">
        <div className="mx-auto max-w-[80rem] px-4 py-20 sm:px-6 md:py-28">
          <Reveal className="mx-auto flex max-w-[48rem] flex-col items-center gap-6 text-center">
            <Eyebrow>Be there from day one</Eyebrow>
            <H2>Two ways in. <Em>Pick yours.</Em></H2>
          </Reveal>
          <div className="mt-14 grid gap-5 lg:grid-cols-2">
            <Reveal className="relative isolate flex flex-col gap-7 overflow-hidden rounded-[2rem] bg-honey-soft p-7 sm:p-10">
              <span aria-hidden className="pointer-events-none absolute -right-12 -top-12 -z-10 h-36 w-36 rounded-full border-[16px] border-brand/15" />
              <div className="flex flex-col gap-3 pr-8">
                <p className="text-[14px] font-bold text-brand">I give</p>
                <h3 className="font-display text-[clamp(1.875rem,3vw,2.5rem)] font-extrabold! leading-[1.05] tracking-[-0.02em] text-balance">Hear the day {appName} opens.</h3>
                <p className="max-w-[30rem] text-[17px] leading-relaxed text-muted">Give once or every month, set a goal for the tax year and watch your ring fill, with every s18A receipt in one place.</p>
              </div>
              <ul className="flex flex-col gap-3 text-[16px] font-semibold">
                {(["Every charity checked by a person", "Every gift and receipt in one place", "Goals, streaks and your giving record"] as const).map((t) => (
                  <li key={t} className="flex items-center gap-3">
                    <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sage"><Icon name="check" className="stroke-white" size={13} /></span>
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-auto rounded-[1.5rem] bg-white p-5 shadow-[0_18px_40px_rgba(23,73,181,0.10)] sm:p-6">
                {listOpen ? (
                  <NotifyForm />
                ) : (
                  <p className="text-[16px] leading-relaxed">
                    <span className="font-bold">The launch list opens soon.</span>{" "}
                    {whatsApp ? <>Until then, <a href={whatsApp} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline underline-offset-4">message us on WhatsApp</a> and we&apos;ll let you know.</> : null}
                  </p>
                )}
              </div>
            </Reveal>

            <Reveal className="relative isolate flex flex-col gap-7 overflow-hidden rounded-[2rem] bg-brand p-7 text-white sm:p-10">
              <span aria-hidden className="pointer-events-none absolute -right-12 -top-12 -z-10 h-36 w-36 rounded-full border-[16px] border-white/20" />
              <span aria-hidden className="pointer-events-none absolute -bottom-6 right-[12%] -z-10 h-12 w-12 rounded-full bg-coral" />
              <div className="flex flex-col gap-3 pr-8">
                <p className="text-[14px] font-bold text-honey">I run a charity</p>
                <h3 className="font-display text-[clamp(1.875rem,3vw,2.5rem)] font-extrabold! leading-[1.05] tracking-[-0.02em] text-balance text-white!">We&apos;re picking our first charities.</h3>
                <p className="max-w-[30rem] text-[17px] leading-relaxed text-white/85">
                  {external
                    ? "Message us on WhatsApp and we'll talk you through joining, so you're ready to take gifts from launch day."
                    : "Apply now and a person on our team reads your application, so you're ready to take gifts from launch day."}
                </p>
              </div>
              <ul className="flex flex-col gap-3 text-[16px] font-semibold">
                {(["s18A receipts and the IT3(d) file, done with you", "Thank-yous in your words, to every donor", "Monthly donations looked after"] as const).map((t) => (
                  <li key={t} className="flex items-center gap-3">
                    <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white"><Icon name="check" className="stroke-brand" size={13} /></span>
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a href={charityHref} {...ext} className="inline-flex min-h-13 items-center justify-center gap-2 rounded-[1.125rem] bg-white whitespace-nowrap px-7 text-[17px] font-bold text-brand shadow-[0_5px_0_#0b2a73] hover:bg-honey-soft">
                  {external ? <><WhatsAppMark size={20} />Register on WhatsApp</> : "Apply to list your charity"}
                </a>
                {applyOpen ? <Link href="/demo/dashboard" className={lineBtnDark}>Try the demo dashboard</Link> : null}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 3. The dashboard, once, in a window to click around in. */}
      <section className="bg-brand text-white">
        <div className="mx-auto max-w-[80rem] px-4 py-20 sm:px-6 md:py-28">
          <Reveal className="mx-auto flex max-w-[52rem] flex-col items-center gap-6 text-center">
            <Eyebrow dark>For charities</Eyebrow>
            <H2 dark>Every gift, every donor, <Em dark>every receipt.</Em></H2>
            <p className="max-w-[36rem] text-[clamp(1.0625rem,1.5vw,1.1875rem)] leading-relaxed text-white/85">The real dashboard, with a made-up charity. Click the tabs: it&apos;s what you&apos;ll use from launch day.</p>
          </Reveal>
          <Reveal className="mx-auto mt-12 max-w-[80rem] text-navy">
            <LiveWindow
              label="The charity dashboard, with sample data"
              menuFrom="lg"
              tabs={[
                { label: "Overview", screen: <Screen name="overview" alt="The overview: what needs you this week, this month's total and the tax year so far. Sample data." /> },
                { label: "Donations", screen: <Screen name="donations" alt="The donations list: every gift with who gave, what for, where it came from and the date. Sample data." /> },
                { label: "Thank donors", screen: <Screen name="thank" alt="Thank donors: your own note, and a preview of the email the donor gets. Sample data." /> },
                { label: "s18A receipts", screen: <Screen name="receipts" alt="s18A receipts: the yearly list, ready to check and approve. Sample data." /> },
              ]}
            />
          </Reveal>
        </div>
      </section>

      {/* 4. Big facts, no invented numbers. */}
      <section className="bg-white">
        <Reveal className="mx-auto max-w-[80rem] px-4 py-20 sm:px-6 md:py-28">
          <div className="mx-auto flex max-w-[48rem] flex-col items-center gap-6 text-center">
            <Eyebrow>Built to be trusted with money</Eyebrow>
            <H2>Safe for donors. <Em>Simple for charities.</Em></H2>
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

      {/* 5. Questions, and a person to ask. */}
      <Questions
        title={<>Good to <em className="font-extrabold not-italic text-brand">know</em>.</>}
        faqs={QUESTIONS}
        more={whatsApp ? (
          <a href={whatsApp} target="_blank" rel="noopener noreferrer" className={lineBtn}><WhatsAppMark size={20} />Ask us on WhatsApp</a>
        ) : null}
        width="max-w-[80rem]"
      />

      {/* 6. The close. */}
      <section className="hero-glow relative overflow-hidden bg-brand text-white">
        <Reveal className="mx-auto flex max-w-[80rem] flex-col items-center gap-8 px-4 py-24 text-center sm:px-6 md:py-32">
          <span className="flex h-28 w-28 items-center justify-center rounded-full bg-white shadow-[0_20px_50px_rgba(6,22,70,0.35)] md:h-32 md:w-32"><Splash className="w-16 md:w-20" /></span>
          <h2 className="max-w-[56rem] font-display text-[clamp(2.75rem,5.2vw,4.75rem)] font-medium! leading-[1.04] tracking-[-0.03em]! text-balance text-white!">
            {launch ? `${launch.split(" ")[0]} is close.` : "Launch is close."} <Em dark>Be there from day one.</Em>
          </h2>
          <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <a href="#join" className={orangeBtn}>{listOpen ? "Get early access" : "I give"}</a>
            <a href={charityHref} {...ext} className={lineBtnDark}>{external ? "Charities: WhatsApp us" : "Apply to list your charity"}</a>
          </div>
        </Reveal>
      </section>

      <footer className="bg-brand-deep text-white">
        <div className="mx-auto flex max-w-[80rem] flex-col gap-8 px-4 py-12 text-[15px] sm:px-6 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-3">
            <span className="flex w-fit items-center rounded-full bg-white px-3 py-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt={appName} width={97} height={32} className="h-7 w-auto" />
            </span>
            <p className="text-white/75">Giving, made easy.</p>
          </div>
          <nav aria-label="Contact and policies" className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-6">
            {whatsApp ? (
              <a href={whatsApp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-white/80 underline-offset-4 hover:text-white hover:underline">
                <WhatsAppMark />WhatsApp {legalConfig.supportWhatsApp}
              </a>
            ) : null}
            {email ? <a href={`mailto:${email}`} className="inline-flex min-h-11 items-center text-white/80 underline-offset-4 hover:text-white hover:underline">{email}</a> : null}
            <Link href="/privacy" className="inline-flex min-h-11 items-center text-white/80 underline-offset-4 hover:text-white hover:underline">Privacy</Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center text-white/80 underline-offset-4 hover:text-white hover:underline">Terms</Link>
          </nav>
        </div>
        <div className="mx-auto max-w-[80rem] px-4 sm:px-6"><p className="border-t border-white/15 py-6 text-[14px] text-white/70">© {new Date().getFullYear()} {appName}</p></div>
      </footer>
    </div>
  );
}

