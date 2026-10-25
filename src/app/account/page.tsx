import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { Splash } from "@/components/splash";
import { BilingualName } from "@/components/bilingual-name";
import { requireViewer } from "@/lib/auth";
import { formatDate, taxYearFor, taxYearLabel } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { MonthlyButton } from "./monthly-button";
import { loadTaxPack } from "@/lib/tax-pack/load";
import type { TaxPack } from "@/lib/tax-pack/build";
import { DECLINED_REASON, NEW_CARD_NOT_REUSABLE } from "@/lib/donations/monthly-reasons";

export const metadata: Metadata = { title: "Account", robots: { index: false, follow: false } };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const viewer = await requireViewer();
  const { denied, monthly: monthlyResult } = await searchParams;

  // Only the receipts that belong to this person as a donor (not every receipt
  // of a charity they manage).
  const supabase = await createClient();
  const { data: myDonors } = await supabase.from("donors").select("id").eq("user_id", viewer.userId);
  const donorIds = (myDonors ?? []).map((d) => d.id as string);
  const { data: receipts } = donorIds.length
    ? await supabase
        .from("s18a_receipts")
        .select("id, tax_year, amount_cents, issued_at, status, pdf_path, reference:details->>receipt_reference, charity_name:details->charity->>legal_name_en")
        .in("donor_id", donorIds)
        .order("issued_at", { ascending: false })
    : { data: [] };

  const { data: monthlyGifts } = donorIds.length
    ? await supabase
        .from("recurring_donations")
        .select("id, amount_cents, contribution_cents, status, next_charge_at, card_last4, ended_reason, failed_attempts, charities(name_en, slug)")
        .in("donor_id", donorIds)
        .in("status", ["active", "paused", "failed"])
        .order("created_at", { ascending: false })
    : { data: [] };

  // This tax year's gifts, from the same reading as the tax pack (paid donations only, Johannesburg dates).
  const thisYear = taxYearFor(new Date());
  let giving: TaxPack | null | "unavailable" = null;
  try {
    giving = await loadTaxPack(viewer.userId, thisYear);
  } catch (e) {
    console.error(e);
    giving = "unavailable";
  }
  const recent = giving && giving !== "unavailable" ? [...giving.lines].reverse().slice(0, 5) : [];

  return (
    // full-bleed: the header band runs edge to edge, like a charity's dashboard (see globals.css).
    <div className="full-bleed overflow-x-clip">
      <header className="relative overflow-hidden border-b-2 border-border bg-honey-soft">
        {/* The logo's splash, whole, in the space kept free beside the badges (laptops only). */}
        <Splash className="absolute right-[max(1.5rem,calc(50%-36rem))] top-1/2 hidden h-auto w-20 -translate-y-1/2 sm:block" />
        <div className="relative mx-auto flex max-w-[75rem] flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 py-6 sm:px-6">
          <div className="min-w-0 space-y-1">
            <h1 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-extrabold leading-tight text-indigo">Your account</h1>
            <p className="break-all text-[15px] text-muted">{viewer.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:mr-24">
            <Badge>Donor</Badge>
            {viewer.managedCharityIds.length > 0 ? <Badge tone="brand">Charity admin</Badge> : null}
            {viewer.isPlatformAdmin ? <Badge tone="success">Platform admin</Badge> : null}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
      {monthlyResult === "done" ? <p role="status" className="rounded-control bg-success-soft p-3 text-sm text-success">Your monthly donation has been updated.</p> : null}
      {monthlyResult === "error" ? <p role="status" className="rounded-control bg-danger-soft p-3 text-sm text-danger">We couldn&apos;t change that monthly donation. Please try again.</p> : null}
      {denied ? (
        <div className="space-y-2 rounded-control bg-danger-soft p-3 text-sm text-danger">
          <p>You don&apos;t have access to that page with this account{viewer.email ? ` (${viewer.email})` : ""}.</p>
          <p>If you were invited to help run a charity, sign in with the email address the invitation was sent to.</p>
          <form action="/auth/signout" method="post"><button className="underline">Sign out</button></form>
        </div>
      ) : null}
      {/* What a donor came for first: what they gave this tax year, and the latest gifts. */}
      <section aria-labelledby="your-giving" className="space-y-4 rounded-card border-2 border-border bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="your-giving" className="font-display text-xl font-bold text-indigo">Your giving</h2>
          <span className="text-sm text-muted">Tax year {thisYear} so far</span>
        </div>
        {giving === "unavailable" ? (
          <p role="status" className="rounded-control bg-warning-soft p-3 text-sm text-warning">
            We couldn&apos;t load your gifts just now. Nothing has changed. Refresh the page to try again.
          </p>
        ) : giving && giving.lines.length > 0 ? (
          <>
            <div className="flex flex-col gap-1">
              <span className="font-display text-[2.5rem] font-extrabold leading-none tabular-nums text-navy">{formatRand(giving.totalCents)}</span>
              <span className="text-sm text-muted">
                {giving.lines.length === 1 ? "1 gift" : `${giving.lines.length} gifts`} to{" "}
                {giving.byCharity.length === 1 ? "1 charity" : `${giving.byCharity.length} charities`}
              </span>
            </div>
            <ul className="divide-y divide-border border-y border-border">
              {recent.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-4 py-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">{g.charityName}</span>
                    <span className="text-sm text-muted">{formatDate(g.paidAt)}{g.monthly ? " · Monthly" : ""}</span>
                  </span>
                  <span className="shrink-0 font-bold tabular-nums">{formatRand(g.cents)}</span>
                </li>
              ))}
            </ul>
            <Link href={`/account/tax-pack/${thisYear}`} className="inline-flex min-h-11 items-center font-bold text-brand underline underline-offset-4">
              {giving.lines.length > recent.length ? `See all ${giving.lines.length} gifts in your tax pack` : "See your tax pack"}
            </Link>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-muted">No gifts yet this tax year. Gifts made with this email address show here.</p>
            <Link href="/charities" className="inline-flex min-h-11 items-center font-bold text-brand underline underline-offset-4">Find a charity</Link>
          </div>
        )}
      </section>

      {monthlyGifts && monthlyGifts.length > 0 ? (
        <section className="rounded-card border-2 border-border bg-surface p-5 sm:p-6 space-y-3">
          <h2 className="font-display text-xl font-bold text-indigo">Your monthly donations</h2>
          <ul className="space-y-2">
            {monthlyGifts.map((m) => {
              const charity = (Array.isArray(m.charities) ? m.charities[0] : m.charities) as { name_en: string; slug: string } | null;
              return (
                <li key={m.id} className="rounded-control border-2 border-border p-3 text-sm">
                  <p className="font-medium">{charity ? <Link href={`/c/${charity.slug}`} className="underline underline-offset-4">{charity.name_en}</Link> : "Charity"}: {formatRand(Number(m.amount_cents) + Number(m.contribution_cents))} a month</p>
                  <p className="text-muted">
                    {m.status === "active" && m.failed_attempts > 0 ? "Your card was declined this month. We'll try it again, or you can put in a new card. " : null}
                    {m.status === "active" && m.next_charge_at ? `${m.failed_attempts > 0 ? "Next try" : "Next payment"} on ${formatDate(m.next_charge_at)}` : null}
                    {m.status === "paused" ? "Paused. Nothing is collected until you resume." : null}
                    {m.status === "failed" ? (m.ended_reason === NEW_CARD_NOT_REUSABLE ? "Stopped: the card you put in can't be used for monthly payments. Start a new monthly donation on the charity's page to carry on." : "Stopped: we could not collect it from your card. Put in a new card to carry it on.") : null}
                    {m.card_last4 && m.status !== "failed" ? ` · Card ending ${m.card_last4}` : null}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {(m.status === "failed" && m.ended_reason === DECLINED_REASON) || (m.status === "active" && m.failed_attempts > 0) ? (
                      <Link href={`/monthly/new-card?m=${m.id}`} className="pressable inline-flex min-h-11 items-center rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-brand-contrast">
                        Update card
                      </Link>
                    ) : null}
                    {m.status === "active" ? <MonthlyButton id={m.id} status="paused" label="Pause" /> : null}
                    {m.status === "paused" ? <MonthlyButton id={m.id} status="active" label="Resume" /> : null}
                    {m.status === "failed" ? (
                      <MonthlyButton id={m.id} status="cancelled" label="Remove" />
                    ) : (
                      <MonthlyButton id={m.id} status="cancelled" label="Cancel for good" danger confirmText="Cancel this monthly donation for good? We will forget your card and collect nothing more." />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="rounded-card border-2 border-border bg-surface p-5 sm:p-6 space-y-3">
        <h2 className="font-display text-xl font-bold text-indigo">Your s18A receipts</h2>
        {receipts && receipts.length > 0 ? (
          <ul className="space-y-2">
            {receipts.map((r) => (
              <li key={r.id} className="rounded-control border-2 border-border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{r.reference}</p>
                    <p className="text-muted">{r.charity_name}</p>
                    <p className="text-muted">{taxYearLabel(r.tax_year)}</p>
                    <p className="text-muted">Issued {formatDate(r.issued_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatRand(r.amount_cents)}</p>
                    {r.status === "void" ? (
                      <Badge tone="warning">Withdrawn</Badge>
                    ) : r.pdf_path ? (
                      <Link href={`/receipts/${r.id}`} prefetch={false} className="text-brand underline">Download PDF</Link>
                    ) : (
                      <span className="text-muted">PDF on its way</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            Your s18A receipts appear here once a tax year closes, one for each charity you gave to with a receipt.
            Sign in with the same email address you gave with.
          </p>
        )}
      </section>

      <section className="rounded-card border-2 border-border bg-surface p-5 sm:p-6 space-y-2">
        <h2 className="font-display text-xl font-bold text-indigo">Tax packs</h2>
        <p className="text-sm text-muted">Every donation in a tax year, what goes on s18A receipts, and the totals. Save it as a PDF or a spreadsheet for your tax return.</p>
        <ul className="flex flex-wrap gap-2">
          {[0, 1, 2].map((back) => {
            const year = taxYearFor(new Date()) - back;
            return (
              <li key={year}>
                <Link href={`/account/tax-pack/${year}`} className="inline-flex min-h-11 items-center rounded-control border border-brand px-4 text-sm font-semibold text-brand">
                  Tax year {year}{back === 0 ? " so far" : ""}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {viewer.managedCharityIds.length > 0 || viewer.isPlatformAdmin ? (
        <section className="rounded-card border-2 border-border bg-surface p-5 sm:p-6 space-y-3">
          <h2 className="font-display text-xl font-bold text-indigo">Manage</h2>
          {viewer.charities.map((c) => (
            <Link key={c.id} href={`/charity-admin/${c.id}`} className="block rounded-control border-2 border-border p-3">
              <BilingualName en={c.name_en} he={c.name_he} />
            </Link>
          ))}
          {viewer.managedCharityIds.length > 0 && viewer.charities.length === 0 ? (
            <Link href="/charity-admin" className="block rounded-control border-2 border-border p-3">
              Your charities (you&apos;ll be asked for your authenticator code)
            </Link>
          ) : null}
          {viewer.isPlatformAdmin ? (
            <Link href="/admin" className="block rounded-control border-2 border-border p-3">
              Platform admin
            </Link>
          ) : null}
        </section>
      ) : null}

      <Link href="/account/data" className="block rounded-card border-2 border-border bg-surface p-5 text-sm transition hover:border-brand">
        <span className="font-display text-lg font-bold text-indigo">Your information</span>
        <span className="block text-muted">Download it, or ask us to correct or delete it</span>
      </Link>

      <form action="/auth/signout" method="post">
        <button className="inline-flex min-h-11 items-center text-sm text-muted underline">Sign out</button>
      </form>
      </div>
    </div>
  );
}
