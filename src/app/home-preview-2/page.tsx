import type { Metadata } from "next";
import Link from "next/link";
import { ChromeMark } from "@/components/chrome-mark";
import { ArrowRight, Questions, arrowLink } from "@/components/landing/sections";
import { CheckedPicture, DashboardPicture, MonthlyPicture, PhonePicture, ReceiptPicture } from "@/components/landing/pictures";
import { Icon, Key, type IconName } from "@/components/marketing";
import { MobileMenu } from "@/components/mobile-menu";
import { Reveal } from "@/components/reveal";
import { appLinks } from "@/config/app-links";
import { legalConfig } from "@/config/legal";
import { platformConfig } from "@/config/platform";
import { charityFaqs, donorFaqs, withoutCostQuestions } from "@/lib/seo/faq";

// A SECOND PREVIEW of the home page, in a calm "payments company" layout (Yehuda, 16/11/2026: "https://stripe.com/
// and do this one next"): a moving colour wash behind the hero with a slanted edge, a left-aligned headline with the
// product floating beside it, neat bordered cards, and a slanted blue band. Not linked and kept out of search
// results; the live home page is src/app/page.tsx until Yehuda chooses. Wording already on the site only.

export const metadata: Metadata = {
  title: { absolute: `${platformConfig.appName}: giving, made easy (preview 2)` },
  robots: { index: false, follow: false },
};

const appName = platformConfig.appName;

/** A small bordered card: an icon, a title, one line, and a link. */
function Card({ icon, title, body, href, link }: { icon: IconName; title: string; body: string; href?: string; link?: string }) {
  return (
    <li className="lift flex flex-col gap-3 rounded-[1.5rem] border-[1.5px] border-border bg-white p-6">
      <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft">
        <Icon name={icon} className="stroke-brand" size={20} />
      </span>
      <h3 className="font-display text-[1.25rem] font-bold leading-tight">{title}</h3>
      <p className="text-[15px] leading-relaxed text-muted">{body}</p>
      {href && link ? <Link href={href} className={`${arrowLink} mt-auto text-[15px]`}>{link}<ArrowRight /></Link> : null}
    </li>
  );
}

/** One of the two sides: a big card with three lines and a picture. */
function Side({ kicker, title, points, href, link, picture, tone }: { kicker: string; title: string; points: string[]; href: string; link: string; picture: React.ReactNode; tone: "lilac" | "peach" }) {
  return (
    <div className={`flex flex-col overflow-hidden rounded-[2rem] ${tone === "lilac" ? "bg-honey-soft" : "bg-peach"}`}>
      <div className="flex flex-col gap-4 p-7 md:p-10">
        <p className="text-[14px] font-bold text-brand">{kicker}</p>
        <h3 className="font-display text-[clamp(1.75rem,3vw,2.5rem)] font-extrabold leading-[1.05] tracking-[-0.025em] text-balance">{title}</h3>
        <ul className="flex flex-col gap-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-[16px] leading-relaxed">
              <span aria-hidden className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand"><Icon name="check" className="stroke-white" size={12} /></span>
              {p}
            </li>
          ))}
        </ul>
        <Link href={href} className={arrowLink}>{link}<ArrowRight /></Link>
      </div>
      <div className="mt-auto h-[19rem] overflow-hidden px-6">
        <div className="origin-top scale-[0.86]">{picture}</div>
      </div>
    </div>
  );
}

export default function HomePreviewTwo() {
  const contact = legalConfig.supportEmail;
  const navLink = "inline-flex min-h-11 items-center rounded-full px-3 font-semibold text-white/95 underline-offset-4 hover:underline";
  return (
    <div className="full-bleed overflow-x-clip">
      <ChromeMark kind="landing" />

      {/* 1. Hero: a slow colour wash, a slanted bottom edge, the promise on the left and the product on the right. */}
      <section className="relative isolate">
        <div aria-hidden className="wash absolute inset-x-0 top-0 -z-10 h-[calc(100%+4rem)] overflow-hidden bg-brand">
          <span className="wash-blob wash-a" />
          <span className="wash-blob wash-b" />
          <span className="wash-blob wash-c" />
          <span className="wash-blob wash-d" />
        </div>

        <header className="mx-auto flex h-16 max-w-[75rem] items-center justify-between gap-3 px-4 sm:h-20 sm:px-6">
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
        </header>

        <div className="mx-auto grid max-w-[75rem] items-center gap-12 px-4 pb-24 pt-10 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:pb-36 md:pt-16">
          <div className="flex min-w-0 flex-col items-start gap-6 text-white">
            {appLinks.launchMonth ? (
              <p className="hero-rise inline-flex items-center gap-2.5 rounded-full bg-white/15 px-4 py-2 text-[14px] font-semibold backdrop-blur sm:text-[15px]">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-coral" />
                Launching in South Africa, {appLinks.launchMonth}.
              </p>
            ) : null}
            <h1 className="hero-rise font-display text-[clamp(3.25rem,8vw,6.5rem)] font-extrabold leading-[0.92] tracking-[-0.045em] text-white!" style={{ animationDelay: "80ms" }}>
              Giving, made easy.
            </h1>
            <p className="hero-rise max-w-[32rem] text-[clamp(1.125rem,1.9vw,1.375rem)] leading-relaxed text-white/90" style={{ animationDelay: "180ms" }}>
              One place to give to South African charities, and for charities to look after the people who give.
            </p>
            <div className="hero-rise flex flex-wrap gap-3" style={{ animationDelay: "260ms" }}>
              <Link href="/charities" className="pressable inline-flex min-h-14 items-center rounded-[1.125rem] bg-coral px-7 text-[17px] font-bold text-navy">Find a charity</Link>
              <Link href="/for-charities" className="inline-flex min-h-14 items-center gap-1.5 rounded-[1.125rem] px-4 text-[17px] font-bold text-white underline-offset-4 hover:underline">I run a charity<ArrowRight /></Link>
            </div>
          </div>
          <div className="hero-rise relative min-w-0 [perspective:1600px]" style={{ animationDelay: "360ms" }}>
            <div className="float-tilt relative md:pb-24">
              <div className="md:w-[74%]"><DashboardPicture /></div>
              <div className="absolute -right-4 top-[38%] w-[50%] max-md:hidden">
                <PhonePicture />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. What it does, in a quiet row. */}
      <section aria-label={`What ${appName} does`} className="mx-auto max-w-[75rem] px-4 pt-24 sm:px-6 md:pt-32">
        <ul className="grid grid-cols-2 gap-x-6 gap-y-5 text-[15px] font-semibold text-muted md:grid-cols-5">
          {([
            ["receipt", "s18A receipts"],
            ["repeat", "Once or every month"],
            ["shield", "Checked charities"],
            ["mail", "Thank-you notes"],
            ["chart", "A goal for the tax year"],
          ] as [IconName, string][]).map(([icon, label]) => (
            <li key={label} className="flex items-center gap-2.5">
              <Icon name={icon} className="stroke-brand" size={20} />
              {label}
            </li>
          ))}
        </ul>
      </section>

      {/* 3. Two sides, side by side. */}
      <Reveal as="section" className="mx-auto max-w-[75rem] px-4 py-20 sm:px-6 md:py-28">
        <p className="text-[15px] font-bold text-brand">Two sides, one place</p>
        <h2 className="mt-3 max-w-[44rem] font-display text-[clamp(2.25rem,4.6vw,3.75rem)] font-extrabold leading-[1.02] tracking-[-0.035em] text-balance">
          For the people who give, and the charities <Key>they give to</Key>.
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <Side
            tone="lilac"
            kicker="For donors"
            title="Give in a few taps. Keep every receipt."
            points={["Once or every month. Pause or stop whenever you like.", "Every s18A receipt in one place, ready for your tax return.", "A giving goal for the tax year, if you want one."]}
            href="/for-donors"
            link="See how giving works"
            picture={<PhonePicture />}
          />
          <Side
            tone="peach"
            kicker="For charities"
            title="Get found, get given to, keep your donors."
            points={["s18A receipts, done for you. Preview and approve each one.", "Thank-you notes, short email journeys, and a clear list of who stopped giving.", "Your team, each with the right access."]}
            href="/for-charities"
            link="See everything charities get"
            picture={<DashboardPicture />}
          />
        </div>
      </Reveal>

      {/* 4. The details, as neat cards. */}
      <Reveal as="section" className="mx-auto max-w-[75rem] px-4 pb-24 sm:px-6 md:pb-32">
        <div className="grid items-end gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
          <h2 className="max-w-[40rem] font-display text-[clamp(2rem,4vw,3.25rem)] font-extrabold leading-[1.04] tracking-[-0.03em] text-balance">Everything in <Key>one place</Key>.</h2>
          <Link href="/faq" className={arrowLink}>All questions<ArrowRight /></Link>
        </div>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card icon="search" title="Find a charity" body="Search by name, cause or area. Every charity is checked by a person before it can take a gift." href="/charities" link="Find a charity" />
          <Card icon="repeat" title="Pause, resume or stop" body="From your account, whenever you like. Nobody to phone, no form to fill in." />
          <Card icon="heart" title="In someone's name" body="Add someone's name if the gift is in their memory or honour." />
          <Card icon="receipt" title="One receipt a year from each charity" body="Not a pile of slips. One clear receipt per charity, per tax year." />
          <Card icon="user" title="Give anonymously" body="Your name then won't appear on public pages, campaign lists or live totals." />
          <Card icon="bank" title="Paid to the charity's own bank account" body="Bank details are checked against a bank confirmation letter." href="/for-charities" link="For charities" />
        </ul>
      </Reveal>

      {/* 5. A slanted blue band: trust, with pictures. */}
      <section className="relative isolate py-24 text-white md:py-32">
        <div aria-hidden className="slant absolute inset-0 -z-10 bg-brand">
          <span className="absolute -right-24 top-16 h-80 w-80 rounded-full border-[48px] border-honey/40" />
          <span className="absolute -left-10 bottom-24 h-24 w-24 rounded-full bg-coral" />
        </div>
        <div className="mx-auto grid max-w-[75rem] items-center gap-12 px-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Reveal className="flex min-w-0 flex-col gap-5">
            <p className="text-[15px] font-bold text-honey">Built to be trusted with money</p>
            <h2 className="font-display text-[clamp(2.25rem,4.6vw,3.75rem)] font-extrabold leading-[1.02] tracking-[-0.035em] text-white! text-balance">Safe for donors. Simple for charities.</h2>
            <p className="max-w-[34rem] text-[17px] leading-relaxed text-honey-soft">{appName} is built so that money goes where it should, and personal details stay with the people they belong to.</p>
            <ul className="mt-2 grid gap-5 sm:grid-cols-2">
              {([
                ["lock", "Your card stays private", `You pay on the payment provider's secure page. ${appName} never sees your card and never holds your money.`],
                ["shield", "Every charity checked", "A person looks at each charity's registration documents and bank details before it can take a gift."],
                ["receipt", "s18A receipts done properly", "One receipt a year from each charity that issues them, checked by the charity before it goes out."],
                ["eye", "Your information is yours", "See and download everything we hold about you, and ask us to correct or delete it."],
              ] as [IconName, string, string][]).map(([icon, title, body]) => (
                <li key={title} className="flex flex-col gap-2 border-t border-white/25 pt-4">
                  <Icon name={icon} className="stroke-white" size={22} />
                  <span className="font-display text-[1.125rem] font-bold">{title}</span>
                  <span className="text-[15px] leading-relaxed text-honey-soft">{body}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <div className="relative grid min-w-0 gap-5 sm:grid-cols-2">
            <div className="sm:translate-y-8"><CheckedPicture /></div>
            <div className="flex flex-col gap-5">
              <ReceiptPicture />
              <MonthlyPicture />
            </div>
          </div>
        </div>
      </section>

      {/* 6. How giving works: four steps on a line. */}
      <Reveal as="section" className="mx-auto max-w-[75rem] px-4 py-24 sm:px-6 md:py-32">
        <p className="text-[15px] font-bold text-brand">How it works</p>
        <h2 className="mt-3 max-w-[40rem] font-display text-[clamp(2rem,4vw,3.25rem)] font-extrabold leading-[1.04] tracking-[-0.03em] text-balance">Four steps to a gift that counts.</h2>
        <ol className="relative mt-12 grid gap-10 md:grid-cols-4 md:gap-6">
          <span aria-hidden className="absolute left-6 right-6 top-6 hidden h-[2px] bg-gradient-to-r from-brand via-honey to-coral md:block" />
          {([
            ["search", "Find a charity", "Search by name, cause or area."],
            ["heart", "Pick an amount", "Give once, or every month."],
            ["lock", "Pay on a secure page", `You type your card on the payment provider's own page. ${appName} never sees it.`],
            ["receipt", "Keep the record", "Every gift lands in your account, with your s18A receipt once the tax year ends."],
          ] as [IconName, string, string][]).map(([icon, title, body], i) => (
            <li key={title} className="relative flex flex-col gap-3">
              <span className="relative flex h-12 w-12 items-center justify-center rounded-full border-[1.5px] border-border bg-white shadow-[0_8px_20px_rgba(14,27,61,0.08)]">
                <Icon name={icon} className="stroke-brand" size={20} />
              </span>
              <span className="text-[14px] font-bold text-brand">Step {i + 1}</span>
              <h3 className="font-display text-[1.375rem] font-bold leading-tight">{title}</h3>
              <p className="text-[15px] leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </Reveal>

      {/* 7. Closing: the promise on the left, two ways in on the right. */}
      <section className="border-t border-border bg-honey-soft/60">
        <Reveal className="mx-auto grid max-w-[75rem] items-center gap-10 px-4 py-20 sm:px-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:py-28">
          <div className="flex min-w-0 flex-col gap-5">
            <h2 className="font-display text-[clamp(2.5rem,5.5vw,4.5rem)] font-extrabold leading-[0.98] tracking-[-0.04em] text-balance">Ready when <span className="text-brand">you are.</span></h2>
            <p className="max-w-[32rem] text-[17px] leading-relaxed text-muted">Give to a checked charity in a few taps, or list yours and let the receipts take care of themselves.</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/charities" className="pressable inline-flex min-h-14 items-center rounded-[1.125rem] bg-coral px-7 text-[17px] font-bold text-navy">Find a charity</Link>
            </div>
          </div>
          <ul className="grid min-w-0 gap-4">
            <li>
              <Link href="/for-donors" className="lift flex items-center gap-4 rounded-[1.5rem] border-[1.5px] border-border bg-white p-6">
                <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft"><Icon name="heart" className="stroke-brand" size={22} /></span>
                <span className="flex min-w-0 flex-1 flex-col"><span className="font-display text-[1.25rem] font-bold">I give</span><span className="text-[15px] text-muted">See how giving works</span></span>
                <ArrowRight />
              </Link>
            </li>
            <li>
              <Link href="/apply" className="lift flex items-center gap-4 rounded-[1.5rem] border-[1.5px] border-border bg-white p-6">
                <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft"><Icon name="building" className="stroke-brand" size={22} /></span>
                <span className="flex min-w-0 flex-1 flex-col"><span className="font-display text-[1.25rem] font-bold">I run a charity</span><span className="text-[15px] text-muted">Apply to list your charity</span></span>
                <ArrowRight />
              </Link>
            </li>
          </ul>
        </Reveal>
      </section>

      <Questions
        title={<>Good to <Key>know</Key>.</>}
        faqs={withoutCostQuestions([...donorFaqs.slice(0, 2), ...donorFaqs.filter((f) => /s18A|monthly|every month/i.test(f.q)), ...charityFaqs])}
        more={<Link href="/faq" className={arrowLink}>All questions<ArrowRight /></Link>}
      />

      {/* 8. Footer in columns. */}
      <footer className="border-t border-border">
        <div className="mx-auto grid max-w-[75rem] gap-8 px-4 py-12 text-[15px] sm:grid-cols-2 sm:px-6 md:grid-cols-4">
          <div className="flex flex-col gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt={appName} width={97} height={32} className="h-8 w-auto self-start" />
            <p className="text-muted">Giving, made easy.</p>
          </div>
          {([
            ["For donors", [["/charities", "Find a charity"], ["/for-donors", "How giving works"], ["/login", "Sign in"]]],
            ["For charities", [["/for-charities", "What charities get"], ["/apply", "Apply to list your charity"], ["/demo/dashboard", "Try the dashboard"]]],
            [appName, [["/faq", "Questions"], ["/privacy", "Privacy"], ["/terms", "Terms"]]],
          ] as [string, [string, string][]][]).map(([head, links]) => (
            <nav key={head} aria-label={head} className="flex flex-col gap-1">
              <p className="font-bold text-navy">{head}</p>
              {links.map(([href, label]) => <Link key={href} href={href} className="inline-flex min-h-10 items-center text-muted underline-offset-4 hover:text-brand hover:underline">{label}</Link>)}
              {head === appName && contact ? <a href={`mailto:${contact}`} className="inline-flex min-h-10 items-center text-muted underline-offset-4 hover:text-brand hover:underline">Contact</a> : null}
            </nav>
          ))}
        </div>
        <p className="mx-auto max-w-[75rem] border-t border-border px-4 py-6 text-[14px] text-muted sm:px-6">© {new Date().getFullYear()} {appName}</p>
      </footer>
    </div>
  );
}
