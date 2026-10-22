import Link from "next/link";
import { Info } from "@/components/info";
import { platformConfig } from "@/config/platform";
import { initials } from "@/lib/charity/initials";
import { publicImageUrl } from "@/lib/charity/queries";
import { weekStart } from "@/lib/charity/thank-you";
import { formatRand } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const steps = [
  { title: "Find a charity", body: "Browse registered charities by name, cause or area." },
  { title: "Give in a minute", body: `Choose an amount (from ${formatRand(platformConfig.minDonationCents)}) and pay securely. Givezy charges no fee on donations.` },
  { title: "Keep track", body: "Set a giving goal and see every donation in one place. If you ask for one, your s18A receipt comes once a year." },
];

export default async function Home() {
  // A few approved charities to start with (row-level security shows only approved ones).
  const supabase = await createClient();
  const { data: charities } = await supabase
    .from("charities")
    .select("id, slug, name_en, description_en, logo_path, suburb, city")
    .eq("status", "approved")
    .order("approved_at", { ascending: false })
    .limit(3);
  // Cause of the week, chosen by Givezy (Admin, Cause of the week). None chosen, or it can't load: no card.
  const { data: pick } = await supabase
    .from("featured_charities")
    .select("charities(slug, name_en, description_en, cover_path)")
    .eq("week_start", weekStart(new Date()))
    .maybeSingle();
  const featured = (pick?.charities ?? null) as unknown as { slug: string; name_en: string; description_en: string | null; cover_path: string | null } | null;
  const cover = featured ? publicImageUrl(featured.cover_path) : null;

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-card bg-brand px-6 pb-8 pt-9 text-white sm:px-10 sm:pb-12 sm:pt-12">
        <span aria-hidden className="blob absolute -right-14 -top-16 h-32 w-32 bg-coral sm:-right-16 sm:h-64 sm:w-64" />
        <span aria-hidden className="blob absolute -bottom-16 -right-12 h-28 w-32 rotate-12 bg-honey sm:-bottom-28 sm:-left-20 sm:right-auto sm:h-40 sm:w-48" />
        <span aria-hidden className="blob absolute -bottom-10 right-10 hidden h-24 w-24 -rotate-12 bg-peach sm:block" />
        <div className="relative max-w-xl">
          {/* The site-wide page-title colour is blue; on the blue block it must be white. */}
          <h1 className="pr-10 text-4xl leading-[1.08] text-white! sm:pr-0 sm:text-5xl">{platformConfig.appTagline}</h1>
          <p className="mt-4 text-lg text-honey-soft">
            Give to registered South African charities in a few taps, keep all your giving in one place, and get your s18A receipts
            without chasing anyone.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/charities" className="pressable rounded-control bg-coral px-6 py-3.5 font-bold text-navy">
              Find a charity
            </Link>
            <Link href="/for-charities" className="rounded-control border-2 border-white/70 px-6 py-3 font-semibold text-white hover:bg-white/10">
              For charities
            </Link>
          </div>
        </div>
      </section>

      {featured ? (
        <Link href={`/c/${featured.slug}`} aria-label={`Cause of the week: ${featured.name_en}`} className="relative block overflow-hidden rounded-card bg-navy p-6 text-white sm:p-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cover ? <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
          <span aria-hidden className="absolute inset-0 bg-navy/60" />
          <span className="relative block max-w-xl space-y-1">
            <span className="block text-sm font-bold text-honey">Cause of the week</span>
            <span className="block font-display text-3xl leading-tight text-white">{featured.name_en}</span>
            {featured.description_en ? <span className="line-clamp-2 block text-honey-soft">{featured.description_en}</span> : null}
            <span className="mt-3 inline-block rounded-control bg-coral px-5 py-2.5 font-bold text-navy">See their work</span>
          </span>
        </Link>
      ) : null}

      <section className="space-y-4">
        <h2 className="font-display text-2xl">How it works</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-card bg-honey-soft p-5">
              <span className={`flex h-10 w-10 items-center justify-center rounded-full font-display text-lg ${i === 1 ? "bg-coral text-navy" : "bg-brand text-white"}`}>{i + 1}</span>
              <h3 className="mt-3 font-display text-xl">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
        <Info terms={["s18a"]} label="an s18A receipt" />
      </section>

      {charities && charities.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl">Charities on {platformConfig.appName}</h2>
            <Link href="/charities" className="text-sm font-semibold text-brand underline">See all</Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3">
            {charities.map((c) => {
              const logo = publicImageUrl(c.logo_path);
              return (
                <li key={c.id}>
                  <Link href={`/c/${c.slug}`} className="flex h-full gap-3 rounded-card border-[1.5px] border-border bg-surface p-4 transition hover:border-brand sm:flex-col">
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logo} alt="" className="h-14 w-14 shrink-0 rounded-control border border-border object-cover" />
                    ) : (
                      <div aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-control bg-brand font-display text-xl text-white">
                        {initials(c.name_en)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-display text-lg text-indigo">{c.name_en}</p>
                      {c.suburb || c.city ? <p className="text-sm text-muted">{[c.suburb, c.city].filter(Boolean).join(", ")}</p> : null}
                      {c.description_en ? <p className="mt-1 line-clamp-2 text-sm text-muted">{c.description_en}</p> : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="relative overflow-hidden rounded-card bg-honey-soft p-6">
        <span aria-hidden className="blob absolute -right-8 -top-8 h-24 w-24 bg-peach" />
        <div className="relative">
          <p className="font-display text-xl text-indigo">Use the {platformConfig.appName} app</p>
          <p className="mt-1 text-sm text-muted">See every donation, track your giving goal, and find your receipts. Coming to the App Store and Google Play.</p>
        </div>
      </section>
    </div>
  );
}
