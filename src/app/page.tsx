import type { Metadata } from "next";
import Link from "next/link";
import { ChromeMark } from "@/components/chrome-mark";
import { JsonLd } from "@/components/json-ld";
import { Doors } from "@/components/landing/doors";
import { NotifyForm } from "@/components/landing/notify-form";
import { TryDemo } from "@/components/landing/try-demo";
import { Icon, type IconName } from "@/components/marketing";
import { Splash } from "@/components/splash";
import { appLinks } from "@/config/app-links";
import { legalConfig } from "@/config/legal";
import { platformConfig } from "@/config/platform";
import { appCta } from "@/lib/audience";
import { siteOrigin } from "@/lib/request-origin";
import { organisationData } from "@/lib/seo/structured-data";

// The landing page (Yehuda, 10/11/2026): Givezy is coming, and a visitor picks one of two doors, "I give" or "I run a
// charity". Nothing else competes with them. Each door opens its short story in place (components/landing/doors.tsx).
// Every other public page (charities, a charity's page, For charities, FAQ, the demo) still works by link. Every
// claim here is one we can back today; the pictures are labelled samples.

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
function Story({ title, points, action, after, picture, tone }: { title: string; points: { icon: IconName; title: string; body: string }[]; action?: React.ReactNode; after?: React.ReactNode; picture: React.ReactNode; tone: "brand" | "lilac" }) {
  return (
    <div className="flex flex-col gap-10 pb-6 pt-8 md:gap-14 md:pt-14">
      <div className="grid items-center gap-10 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] md:gap-14">
        <div className="flex min-w-0 flex-col gap-7">
          <h2 data-panel-title tabIndex={-1} className="font-display text-[clamp(2rem,4vw,3rem)] font-extrabold leading-[1.05] tracking-[-0.02em] text-balance outline-none">{title}</h2>
          <ul className="flex flex-col gap-5">
            {points.map((p) => <Point key={p.title} {...p} tone={tone} />)}
          </ul>
          {action ? <div>{action}</div> : null}
        </div>
        <div className="min-w-0">{picture}</div>
      </div>
      {after}
    </div>
  );
}

const gifts = [
  { date: "02/10/2026", name: "A food parcel charity", tag: "s18A receipt", amount: "R500" },
  { date: "28/09/2026", name: "A school charity", tag: "once-off", amount: "R250" },
  { date: "19/09/2026", name: "An old-age home", tag: "monthly", amount: "R180" },
  { date: "05/09/2026", name: "A medical support charity", tag: "s18A receipt", amount: "R360" },
];

/** The giver's picture: a phone with a sample giving history. */
function PhonePicture() {
  return (
    <figure className="relative mx-auto w-full max-w-[22rem]">
      <span aria-hidden className="absolute -left-8 top-10 -z-10 h-40 w-40 rounded-full bg-peach" />
      <span aria-hidden className="absolute -right-6 bottom-6 -z-10 h-24 w-24 rounded-full bg-honey" />
      <div className="rounded-[2.5rem] border-[10px] border-navy bg-white p-5 shadow-[0_40px_80px_rgba(14,27,61,0.18)]">
        <div className="flex items-center justify-between">
          <p className="font-display text-[1.25rem] font-bold">Your giving</p>
          <span className="rounded-full bg-honey-soft px-2.5 py-1 text-[12px] font-semibold text-brand">Sample</span>
        </div>
        <div className="mt-4 rounded-[1.25rem] bg-brand p-4 text-white">
          <p className="text-[13px] opacity-80">This tax year</p>
          <p className="font-display text-[2rem] font-extrabold leading-tight">R1 290</p>
          <p className="text-[13px] opacity-80">2 s18A receipts ready</p>
        </div>
        <ul className="mt-3 flex flex-col">
          {gifts.map((g) => (
            <li key={g.date} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[14px] font-semibold">{g.name}</span>
                <span className="text-[12px] text-muted">{g.date}, {g.tag}</span>
              </span>
              <span className="shrink-0 text-[14px] font-bold">{g.amount}</span>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="sr-only">A sample of the giving history in the Givezy app.</figcaption>
    </figure>
  );
}

const needs: { icon: IconName; text: string }[] = [
  { icon: "heart", text: "3 new donors to thank" },
  { icon: "receipt", text: "2 donors need to add s18A details" },
  { icon: "repeat", text: "1 monthly card was declined" },
];

/** The charity's picture: a sample "Needs you this week" card from the dashboard. */
function DashboardPicture() {
  return (
    <figure className="relative mx-auto w-full max-w-[28rem]">
      <span aria-hidden className="absolute -right-8 -top-8 -z-10 h-36 w-36 rounded-full bg-brand" />
      <span aria-hidden className="absolute -bottom-6 left-6 -z-10 h-20 w-20 rounded-full bg-peach" />
      <div className="rounded-[1.75rem] border-[1.5px] border-border bg-white p-6 shadow-[0_40px_80px_rgba(14,27,61,0.14)]">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-[1.25rem] font-bold">Needs you this week</p>
          <span className="rounded-full bg-honey-soft px-2.5 py-1 text-[12px] font-semibold text-brand">Sample</span>
        </div>
        <ul className="mt-4 flex flex-col gap-2.5">
          {needs.map((n) => (
            <li key={n.text} className="flex items-center gap-3 rounded-[1rem] bg-honey-soft px-4 py-3">
              <Icon name={n.icon} className="shrink-0 stroke-brand" size={20} />
              <span className="min-w-0 flex-1 text-[15px] font-semibold">{n.text}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-[1rem] border-[1.5px] border-border px-4 py-3">
          <span className="text-[14px] text-muted">s18A receipts for 2027</span>
          <span className="text-[14px] font-bold text-success">Ready to approve</span>
        </div>
      </div>
      <figcaption className="sr-only">A sample of the charity dashboard on Givezy.</figcaption>
    </figure>
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
        <Link href="/login" className="inline-flex min-h-11 items-center rounded-full px-4 text-[15px] font-semibold text-navy underline-offset-4 hover:underline">Sign in</Link>
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
                { icon: "repeat", title: "Once or every month", body: "Pick a charity and an amount. Pause or stop a monthly gift whenever you like." },
                { icon: "receipt", title: "Every s18A receipt in one place", body: "One s18A receipt a year from each charity that issues them, ready for your tax return." },
                { icon: "lock", title: "Your card stays private", body: "You type it on a secure payment page. Givezy never sees or stores it." },
              ]}
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
              action={
                <div className="flex flex-col items-start gap-3">
                  <Link href="/apply" className="pressable inline-flex min-h-14 items-center rounded-[1.125rem] bg-coral px-7 text-[17px] font-bold text-navy">Apply to list your charity</Link>
                  <p className="text-[15px] text-muted">Listing your charity is free.</p>
                </div>
              }
              picture={<DashboardPicture />}
            />
          }
        />
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[75rem] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-6 text-[14px] text-muted sm:px-6">
          <p>© {new Date().getFullYear()} {platformConfig.appName}</p>
          <nav aria-label="About Givezy" className="flex flex-wrap gap-x-5">
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
