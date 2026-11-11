import type { Metadata } from "next";
import { ChromeMark } from "@/components/chrome-mark";
import { Icon, type IconName } from "@/components/marketing";
import { Splash } from "@/components/splash";
import { appLinks } from "@/config/app-links";
import { legalConfig } from "@/config/legal";
import { platformConfig } from "@/config/platform";

// The public address's one page until launch (Yehuda, 11/11/2026): givezy.co.za shows this and nothing else (see
// lib/coming-soon.ts and proxy.ts). It links nowhere: no sign-in, no charity list, no application, no policies.
// Everything it says is already said on the landing page; nothing about fees. DRAFT WORDING for Yehuda to approve.
// Never listed by search engines, whatever SITE_INDEXING says: robots below is set on the page itself.

export const metadata: Metadata = {
  title: { absolute: `${platformConfig.appName}: giving, made easy` },
  description: `${platformConfig.appName} is a South African giving platform, launching ${appLinks.launchMonth ?? "soon"}. Give to checked charities and keep every s18A receipt in one place. For charities: s18A receipts, thank-yous and the tools to keep their donors.`,
  robots: { index: false, follow: false },
};

type Point = { icon: IconName; title: string; body: string };

const GIVE: Point[] = [
  { icon: "repeat", title: "Once or every month", body: "Pick a charity and an amount. Pause or stop a monthly donation whenever you like." },
  { icon: "receipt", title: "Every s18A receipt in one place", body: "One s18A receipt a year from each charity that issues them, ready for your tax return." },
  { icon: "chart", title: "Goals, streaks and a record", body: "Set a giving goal for the tax year, watch your ring fill, and see your months in a row of giving." },
];

const CHARITY: Point[] = [
  { icon: "receipt", title: "s18A receipts, done for you", body: "Preview and approve each one. The SARS IT3(d) file is ready when you are." },
  { icon: "heart", title: "Donors who come back", body: "Thank-you notes, short email journeys, and a clear list of who stopped giving." },
  { icon: "user", title: "Your team, each with the right access", body: "Owner, admin, finance, fundraiser or viewer." },
];

/** One side of Givezy, shown in full: no button, no link. */
function Side({ tone, title, line, points }: { tone: "give" | "charity"; title: string; line: string; points: Point[] }) {
  const give = tone === "give";
  return (
    <section
      aria-labelledby={`${tone}-title`}
      className={`relative isolate flex min-w-0 flex-col gap-7 overflow-hidden rounded-[2rem] p-7 sm:p-9 ${give ? "bg-brand text-white" : "bg-honey text-navy"}`}
    >
      {/* A ring and a dot bleeding off the edge, as on the landing page's doors: kept in the corners, clear of the words. */}
      <span aria-hidden className={`pointer-events-none absolute -right-12 -top-12 -z-10 h-32 w-32 rounded-full border-[14px] ${give ? "border-white/25" : "border-brand/25"}`} />
      <span aria-hidden className={`pointer-events-none absolute -bottom-5 left-[46%] -z-10 h-10 w-10 rounded-full ${give ? "bg-coral" : "bg-brand"}`} />
      <div className="flex flex-col gap-3 pr-10">
        <h2 id={`${tone}-title`} className={`font-display text-[clamp(2.25rem,5vw,3.5rem)] font-extrabold leading-[0.98] tracking-[-0.03em] text-balance ${give ? "text-white!" : ""}`}>{title}</h2>
        <p className={`max-w-[26rem] text-[17px] leading-snug sm:text-[18px] ${give ? "text-white/90" : "text-navy/80"}`}>{line}</p>
      </div>
      <ul className="flex flex-col gap-5">
        {points.map((p) => (
          <li key={p.title} className="flex gap-4">
            <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white">
              <Icon name={p.icon} className="stroke-brand" size={22} />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="font-display text-[1.25rem] font-bold leading-tight">{p.title}</span>
              <span className={`text-[16px] leading-relaxed ${give ? "text-white/85" : "text-navy/80"}`}>{p.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ComingSoon() {
  const contact = legalConfig.supportEmail;
  return (
    <div className="full-bleed overflow-x-clip">
      <ChromeMark kind="landing" />

      <header className="mx-auto flex h-16 max-w-[75rem] items-center px-4 sm:h-20 sm:px-6">
        {/* Not a link: there is nowhere else to go. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt={platformConfig.appName} width={97} height={32} className="h-8 w-auto sm:h-10" />
      </header>

      <div>
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
              ) : (
                <p className="inline-flex w-fit items-center gap-2.5 rounded-full bg-honey-soft px-3.5 py-2 text-[14px] font-semibold text-navy sm:px-4 sm:text-[15px]">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-coral" />
                  Coming soon to South Africa.
                </p>
              )}
            </div>
            <Splash className="splash-breathe order-first mx-auto w-[11rem] sm:w-[14rem] md:order-none md:w-full md:max-w-[22rem]" />
          </div>
        </section>

        <div className="mx-auto grid max-w-[75rem] gap-4 px-4 pb-16 sm:px-6 md:grid-cols-2 md:gap-6 md:pb-24">
          <Side tone="give" title="I give" line="Give to causes you care about, and keep every receipt in one place." points={GIVE} />
          <Side tone="charity" title="I run a charity" line="Get found, get given to, and keep the people who give." points={CHARITY} />
        </div>
      </div>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[75rem] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-6 text-[14px] text-muted sm:px-6">
          <p>© {new Date().getFullYear()} {platformConfig.appName}</p>
          {contact ? (
            <a href={`mailto:${contact}`} className="inline-flex min-h-11 items-center underline-offset-4 hover:text-brand hover:underline">Contact</a>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
