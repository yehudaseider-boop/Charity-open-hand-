import Link from "next/link";
import { platformConfig } from "@/config/platform";
import { initials } from "@/lib/charity/initials";
import { publicImageUrl } from "@/lib/charity/queries";
import { formatRand } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const steps = [
  { title: "Find a charity", body: "Browse registered charities by name, cause or area." },
  { title: "Give in a minute", body: `Choose an amount (from ${formatRand(platformConfig.minDonationCents).replace(/\.00$/, "")}) and pay securely. NEDIV lev charges no fee on donations.` },
  { title: "Keep track", body: "Mark each donation as maaser, chomesh or tzedaka. If you ask for one, your s18A receipt comes once a year." },
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

  return (
    <div className="space-y-8">
      <section className="rounded-card bg-gradient-to-br from-brand-soft to-surface border border-border p-6 sm:p-8">
        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{platformConfig.appTagline}</h1>
        <p className="mt-3 text-muted">
          Give to registered charities in a few taps, keep your maaser and chomesh in one place, and get your s18A receipts
          without chasing anyone.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/charities" className="rounded-control bg-brand px-5 py-3 font-semibold text-brand-contrast">
            Find a charity
          </Link>
          <Link href="/apply" className="rounded-control border border-border bg-surface px-5 py-3 font-medium">
            List your charity
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">How it works</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-card border border-border bg-surface p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-contrast">{i + 1}</span>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {charities && charities.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold">Charities on {platformConfig.appName}</h2>
            <Link href="/charities" className="text-sm text-brand underline">See all</Link>
          </div>
          <ul className="space-y-3">
            {charities.map((c) => {
              const logo = publicImageUrl(c.logo_path);
              return (
                <li key={c.id}>
                  <Link href={`/c/${c.slug}`} className="flex gap-3 rounded-card border border-border bg-surface p-4">
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logo} alt="" className="h-12 w-12 shrink-0 rounded-control border border-border object-cover" />
                    ) : (
                      <div aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control bg-brand-soft font-bold text-brand">
                        {initials(c.name_en)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold">{c.name_en}</p>
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

      <section className="rounded-card border border-border bg-surface p-5 text-sm">
        <p className="font-semibold">Use the {platformConfig.appName} app</p>
        <p className="mt-1 text-muted">See every donation, track maaser and chomesh against your income, and find your receipts. Coming to the App Store and Google Play.</p>
      </section>
    </div>
  );
}
