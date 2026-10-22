import Link from "next/link";
import { Info } from "@/components/info";
import { platformConfig } from "@/config/platform";
import { initials } from "@/lib/charity/initials";
import { loadCategories, publicImageUrl } from "@/lib/charity/queries";
import { weekStart } from "@/lib/charity/thank-you";
import { formatRand } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

// Home page, design direction A "Splash" (chosen 22/10/2026). The logo's three drops, cut from the logo and never
// redrawn, are the decoration; they sit behind or beside words, never on top of them.

const min = formatRand(platformConfig.minDonationCents);

const steps = [
  { title: "Pick a charity", body: "Search by name, cause or area. We check every charity before it can take a gift.", badge: "bg-brand text-white" },
  { title: `Give from ${min}`, body: "Once, or every month. You pay on the payment provider's secure page, so we never see your card.", badge: "-rotate-6 bg-coral text-navy" },
  { title: "Keep track, without trying", body: `Every gift sits in your ${platformConfig.appName} account, ready for tax season.`, badge: "rotate-6 bg-honey text-navy" },
];

const promises = [
  { title: "Checked by a person", body: "We look at each charity's registration documents and bank details before it can take a gift." },
  { title: "Your card stays with the bank", body: `You pay on the payment provider's page. ${platformConfig.appName} never sees or stores card details.` },
  { title: `No ${platformConfig.appName} fee on your gift`, body: "We don't take a cut. The card provider's fee comes off before the gift reaches the charity." },
  { title: "s18A receipts, once a year", body: "If you ask for one, and the charity is approved to issue them: one receipt per charity for the whole tax year." },
];

/** A decorative drop from the logo. */
function Drop({ colour, className }: { colour: "blue" | "lilac" | "orange"; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/brand/drop-${colour}.png`} alt="" aria-hidden className={`pointer-events-none absolute select-none ${className}`} />;
}

function Tick({ className = "stroke-sage" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 ${className}`}>
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

export default async function Home() {
  // A few approved charities to show (row-level security shows only approved ones).
  const supabase = await createClient();
  const { data: charities } = await supabase
    .from("charities")
    .select("id, slug, name_en, description_en, logo_path, suburb, city")
    .eq("status", "approved")
    .order("approved_at", { ascending: false })
    .limit(4);
  // Cause of the week, chosen by Givezy (Admin, Cause of the week). None chosen, or it can't load: no big card.
  const { data: pick } = await supabase
    .from("featured_charities")
    .select("charities(slug, name_en, description_en, cover_path)")
    .eq("week_start", weekStart(new Date()))
    .maybeSingle();
  const featured = (pick?.charities ?? null) as unknown as { slug: string; name_en: string; description_en: string | null; cover_path: string | null } | null;
  const cover = featured ? publicImageUrl(featured.cover_path) : null;
  const others = (charities ?? []).filter((c) => c.slug !== featured?.slug).slice(0, 3);
  // Cause chips: the same categories as the Charities page. If they can't load, the page shows without them.
  const categories = await loadCategories().catch(() => []);

  return (
    // full-bleed: this page runs edge to edge, with its own 1 200 px column (see globals.css).
    <div className="full-bleed overflow-x-clip">
      {/* Hero */}
      <section className="mx-auto flex max-w-[75rem] flex-wrap items-center gap-12 px-4 pb-20 pt-8 sm:px-6 sm:pb-24 sm:pt-12">
        <div className="relative z-10 flex min-w-0 flex-[1_1_28rem] flex-col items-start gap-6">
          <p className="inline-flex items-center gap-2 rounded-full bg-honey-soft px-3.5 py-2 text-[15px] font-bold text-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/drop-orange.png" alt="" aria-hidden className="h-4 w-auto" />
            Giving made easy.
          </p>
          <h1 className="text-[clamp(2.75rem,6.4vw,5.25rem)] leading-[0.98] tracking-[-0.02em] text-balance">Give in a minute. We keep the paperwork.</h1>
          <p className="max-w-[33rem] text-lg leading-normal text-muted sm:text-xl">
            Find a registered South African charity, give from {min}, and see every gift in one place. If the charity issues s18A
            receipts, you can get one a year for everything you gave it.
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-5">
            <Link href="/charities" className="pressable rounded-control bg-coral px-7 py-4 text-lg font-bold text-navy">
              Find a charity
            </Link>
            <Link href="#how" className="text-[17px] font-semibold text-brand underline underline-offset-4">See how it works</Link>
          </div>
        </div>

        {/* The donor's giving page as the hero picture: the product, not stock photos. */}
        <div className="relative flex min-w-0 flex-[1_1_22rem] justify-center pb-5 pt-16">
          <Drop colour="lilac" className="left-[calc(50%+2.5rem)] -top-2 h-32 w-auto -rotate-8 sm:h-44" />
          <Drop colour="orange" className="left-[calc(50%+6.5rem)] top-0 h-28 w-auto rotate-10 sm:left-[calc(50%+7.5rem)] sm:h-36" />
          <Drop colour="blue" className="left-[calc(50%+5rem)] top-28 hidden w-48 -rotate-4 sm:block" />
          <div className="relative z-10 flex w-[19rem] max-w-full flex-col gap-4 rounded-[2.25rem] border-2 border-border bg-surface px-5 pb-6 pt-5 shadow-[0_30px_60px_rgba(9,37,119,0.16)]">
            <p className="text-[13px] font-bold text-muted">Your giving · this tax year</p>
            <div className="flex justify-center">
              <svg width="190" height="190" viewBox="0 0 190 190" role="img" aria-label="Sample: R4 250 given of a R6 000 goal">
                <circle cx="95" cy="95" r="78" fill="none" stroke="var(--brand-soft)" strokeWidth="18" />
                <circle cx="95" cy="95" r="78" fill="none" stroke="var(--coral)" strokeWidth="18" strokeLinecap="round" strokeDasharray="348 490" transform="rotate(-90 95 95)" />
                <text x="95" y="92" textAnchor="middle" fontFamily="var(--font-fredoka), sans-serif" fontWeight="600" fontSize="34" fill="var(--brand)">R4 250</text>
                <text x="95" y="118" textAnchor="middle" fontFamily="var(--font-dm-sans), sans-serif" fontSize="14" fill="var(--text-muted)">of R6 000 goal</text>
              </svg>
            </div>
            <div className="flex flex-col gap-2.5 text-sm">
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-honey-soft px-3.5 py-3"><span className="font-semibold">A food parcel charity</span><span className="shrink-0 whitespace-nowrap font-bold">R500</span></div>
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-honey-soft px-3.5 py-3"><span className="font-semibold">A school charity</span><span className="shrink-0 whitespace-nowrap font-bold">R250</span></div>
              <p className="flex items-center gap-2 text-[13px] font-semibold text-success"><Tick />s18A receipt after the tax year</p>
            </div>
            <p className="text-center text-xs text-muted">Sample figures</p>
          </div>
        </div>
      </section>

      {/* Discover: one big story, then a short list. Real charities only. */}
      <section id="discover" className="bg-honey-soft py-16 sm:py-22">
        <div className="mx-auto flex max-w-[75rem] flex-col gap-9 px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="max-w-[40rem] font-display text-[clamp(2.125rem,4vw,3.25rem)] font-semibold leading-[1.05] text-balance">Find a cause that feels close to home.</h2>
            <Link href="/charities" className="text-[17px] font-bold text-brand underline underline-offset-4">See all charities</Link>
          </div>

          {categories.length > 0 ? (
            <ul className="flex flex-wrap gap-3" aria-label="Causes">
              {categories.map((c, i) => (
                <li key={c.id}>
                  <Link
                    href={`/charities?category=${c.slug}`}
                    className={`inline-block rounded-full border-2 border-border bg-surface px-4.5 py-2.5 font-semibold text-navy transition hover:border-brand ${i % 3 === 1 ? "-rotate-2" : i % 4 === 3 ? "rotate-2" : ""}`}
                  >
                    {c.name_en}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          {featured || others.length > 0 ? (
            <div className="flex flex-wrap gap-6">
              {featured ? (
                <Link
                  href={`/c/${featured.slug}`}
                  aria-label={`Cause of the week: ${featured.name_en}`}
                  className="relative flex min-h-[18rem] min-w-0 flex-[2_1_30rem] flex-col justify-end gap-2.5 overflow-hidden rounded-[2rem] bg-brand p-7 text-white sm:min-h-[21rem] sm:p-9"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {cover ? <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
                  {cover ? <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-navy/90 via-navy/50 to-navy/10" /> : <Drop colour="orange" className="-bottom-16 -right-12 h-36 w-auto rotate-150 sm:-bottom-10 sm:-right-9" />}
                  <span className="relative text-sm font-bold text-honey">Cause of the week</span>
                  <span className="relative font-display text-[clamp(1.875rem,3.4vw,2.75rem)] font-semibold leading-[1.05]">{featured.name_en}</span>
                  {featured.description_en ? <span className="relative line-clamp-3 max-w-[29rem] text-[17px] leading-normal text-honey-soft">{featured.description_en}</span> : null}
                  <span className="relative mt-2 inline-flex items-center gap-1 self-start font-bold text-white underline underline-offset-4">See their work</span>
                </Link>
              ) : null}
              {others.length > 0 ? (
                <ul className={`flex min-w-0 flex-col gap-4 ${featured ? "flex-[1_1_18rem]" : "flex-1 sm:grid sm:grid-cols-3"}`}>
                  {others.map((c, i) => {
                    const logo = publicImageUrl(c.logo_path);
                    const place = [c.suburb, c.city].filter(Boolean).join(", ");
                    return (
                      <li key={c.id}>
                        <Link href={`/c/${c.slug}`} className="flex h-full items-center gap-4 rounded-card border-2 border-border bg-surface p-5 transition hover:border-brand">
                          {logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logo} alt="" className="h-14 w-14 shrink-0 rounded-control border border-border object-cover" />
                          ) : (
                            <span aria-hidden className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-control font-display text-xl font-semibold text-brand ${i % 2 ? "bg-brand-soft" : "bg-peach"}`}>
                              {initials(c.name_en)}
                            </span>
                          )}
                          <span className="flex min-w-0 flex-col gap-1">
                            <span className="text-[17px] font-bold text-navy">{c.name_en}</span>
                            {place ? <span className="text-sm text-muted">{place}</span> : null}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-2 rounded-card border-2 border-border bg-surface p-6">
              <p className="font-display text-xl font-semibold text-brand">The first charities are joining now</p>
              <p className="text-muted">Check back soon, or tell a charity you love about {platformConfig.appName}.</p>
              <Link href="/for-charities" className="font-bold text-brand underline underline-offset-4">How charities join</Link>
            </div>
          )}
        </div>
      </section>

      {/* How it works: a path, not three identical boxes */}
      <section id="how" className="mx-auto flex max-w-[75rem] scroll-mt-4 flex-col gap-12 px-4 py-20 sm:px-6 sm:py-24">
        <h2 className="text-center font-display text-[clamp(2.125rem,4vw,3.25rem)] font-semibold leading-[1.05] text-balance">Three steps. Then it&apos;s done.</h2>
        <ol className="flex flex-wrap justify-center gap-8">
          {steps.map((s, i) => (
            <li key={s.title} className="flex min-w-0 max-w-[22.5rem] flex-[1_1_16rem] flex-col items-start gap-3">
              <span className={`pressable flex h-16 w-16 items-center justify-center rounded-[1.375rem] font-display text-3xl font-semibold ${s.badge}`}>{i + 1}</span>
              <h3 className="mt-1 font-display text-[1.625rem] font-semibold text-navy">{s.title}</h3>
              <p className="text-[17px] leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Your year of giving (a sample of the donor's account) */}
      <section className="mx-auto max-w-[75rem] px-4 pb-20 sm:px-6 sm:pb-24">
        <div className="relative flex flex-wrap items-center gap-12 overflow-hidden rounded-[2.5rem] bg-navy p-[clamp(1.75rem,5vw,4rem)]">
          <Drop colour="lilac" className="-left-8 -top-28 h-44 w-auto rotate-160" />
          <div className="relative flex min-w-0 flex-[1_1_22rem] flex-col gap-4.5">
            <h2 className="font-display text-[clamp(2rem,3.8vw,3rem)] font-semibold leading-[1.05] text-white! text-balance">Your year of giving, on one page.</h2>
            <p className="text-lg leading-relaxed text-brand-soft">
              See what you gave, to whom and when. Set a goal if you like. When the tax year ends, download your tax pack with your
              s18A receipts in it.
            </p>
            <ul className="flex flex-col gap-2.5 text-[17px] text-white">
              <li className="flex items-center gap-2.5"><Tick className="stroke-coral" />Every gift, every charity, one list</li>
              <li className="flex items-center gap-2.5"><Tick className="stroke-coral" />Monthly gifts you can pause or stop yourself</li>
              <li className="flex items-center gap-2.5"><Tick className="stroke-coral" />A yearly tax pack, ready for your return</li>
            </ul>
          </div>
          <div className="relative flex min-w-0 flex-[1_1_24rem] flex-col gap-3.5 rounded-[1.75rem] bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-display text-[1.375rem] font-semibold text-brand">Giving history</span>
              <span className="text-[13px] text-muted">Sample</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-control bg-honey-soft p-3.5"><p className="text-[13px] text-muted">Given this year</p><p className="mt-1 font-display text-[1.75rem] font-semibold">R4 250</p></div>
              <div className="rounded-control bg-honey-soft p-3.5"><p className="text-[13px] text-muted">Charities</p><p className="mt-1 font-display text-[1.75rem] font-semibold">3</p></div>
            </div>
            <ul className="text-[15px]">
              <li className="flex justify-between gap-3 border-b border-border py-3"><span>02/10/2026 · A food parcel charity</span><span className="shrink-0 whitespace-nowrap font-bold">R500</span></li>
              <li className="flex justify-between gap-3 border-b border-border py-3"><span>15/09/2026 · A school charity</span><span className="shrink-0 whitespace-nowrap font-bold">R250</span></li>
              <li className="flex justify-between gap-3 py-3"><span>01/09/2026 · An old-age home (monthly)</span><span className="shrink-0 whitespace-nowrap font-bold">R180</span></li>
            </ul>
          </div>
        </div>
      </section>

      {/* What we check and promise: plain facts, nothing we can't back */}
      <section className="mx-auto flex max-w-[75rem] flex-wrap gap-10 px-4 pb-20 sm:px-6 sm:pb-24">
        <h2 className="min-w-0 flex-[1_1_18rem] font-display text-[clamp(2rem,3.8vw,2.875rem)] font-semibold leading-[1.05] text-balance">What we check, and what we promise.</h2>
        <div className="min-w-0 flex-[2_1_30rem] space-y-6">
          <dl className="grid gap-x-9 gap-y-7 sm:grid-cols-2">
            {promises.map((p) => (
              <div key={p.title} className="flex flex-col gap-1.5">
                <dt className="text-lg font-bold">{p.title}</dt>
                <dd className="leading-relaxed text-muted">{p.body}</dd>
              </div>
            ))}
          </dl>
          <Info terms={["s18a"]} label="an s18A receipt" />
        </div>
      </section>

      {/* Last call to action */}
      <section className="mx-auto max-w-[75rem] px-4 pb-20 sm:px-6 sm:pb-22">
        <div className="relative flex flex-wrap items-center justify-between gap-7 overflow-hidden rounded-[2.5rem] bg-brand px-[clamp(1.75rem,5vw,4rem)] py-[clamp(2.5rem,6vw,4.5rem)]">
          <Drop colour="orange" className="-right-10 -top-16 h-32 w-auto rotate-200 sm:-bottom-28 sm:-left-12 sm:right-auto sm:top-auto sm:h-44 sm:-rotate-30" />
          <Drop colour="lilac" className="-top-24 left-[50%] hidden h-40 w-auto rotate-160 lg:block" />
          <h2 className="relative max-w-[40rem] font-display text-[clamp(2.125rem,4.4vw,3.5rem)] font-semibold leading-[1.02] text-white! text-balance">Ready when you are.</h2>
          <div className="relative flex flex-wrap items-center gap-5">
            <Link href="/charities" className="pressable rounded-control bg-coral px-7 py-4 text-lg font-bold text-navy">
              Find a charity
            </Link>
            <Link href="/for-charities" className="text-[17px] font-semibold text-white underline underline-offset-4">
              Run a charity? Join {platformConfig.appName}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
