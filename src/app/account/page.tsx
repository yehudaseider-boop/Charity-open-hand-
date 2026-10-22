import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { BilingualName } from "@/components/bilingual-name";
import { requireViewer } from "@/lib/auth";
import { formatDate, taxYearFor, taxYearLabel } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { MonthlyButton } from "./monthly-button";

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
        .select("id, amount_cents, contribution_cents, status, next_charge_at, card_last4, ended_reason, charities(name_en, slug)")
        .in("donor_id", donorIds)
        .in("status", ["active", "paused", "failed"])
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="space-y-4">
      {monthlyResult === "done" ? <p role="status" className="rounded-control bg-success-soft p-3 text-sm text-success">Your monthly donation has been updated.</p> : null}
      {monthlyResult === "error" ? <p role="status" className="rounded-control bg-danger-soft p-3 text-sm text-danger">We couldn&apos;t change that monthly donation. Please try again.</p> : null}
      {denied ? (
        <div className="space-y-2 rounded-control bg-danger-soft p-3 text-sm text-danger">
          <p>You don&apos;t have access to that page with this account{viewer.email ? ` (${viewer.email})` : ""}.</p>
          <p>If you were invited to help run a charity, sign in with the email address the invitation was sent to.</p>
          <form action="/auth/signout" method="post"><button className="underline">Sign out</button></form>
        </div>
      ) : null}
      <section className="rounded-card bg-surface border border-border p-5">
        <h1 className="text-xl font-semibold">Your account</h1>
        <p className="mt-1 break-all text-sm text-muted">{viewer.email}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>Donor</Badge>
          {viewer.managedCharityIds.length > 0 ? <Badge tone="brand">Charity admin</Badge> : null}
          {viewer.isPlatformAdmin ? <Badge tone="success">Platform admin</Badge> : null}
        </div>
      </section>

      {monthlyGifts && monthlyGifts.length > 0 ? (
        <section className="rounded-card bg-surface border border-border p-5 space-y-3">
          <h2 className="font-semibold">Your monthly donations</h2>
          <ul className="space-y-2">
            {monthlyGifts.map((m) => {
              const charity = (Array.isArray(m.charities) ? m.charities[0] : m.charities) as { name_en: string; slug: string } | null;
              return (
                <li key={m.id} className="rounded-control border border-border p-3 text-sm">
                  <p className="font-medium">{charity ? <Link href={`/c/${charity.slug}`} className="underline underline-offset-4">{charity.name_en}</Link> : "Charity"}: {formatRand(Number(m.amount_cents) + Number(m.contribution_cents))} a month</p>
                  <p className="text-muted">
                    {m.status === "active" && m.next_charge_at ? `Next payment on ${formatDate(m.next_charge_at)}` : null}
                    {m.status === "paused" ? "Paused. Nothing is collected until you resume." : null}
                    {m.status === "failed" ? "Stopped: we could not collect it from your card. Start a new monthly donation on the charity's page (the link above) to carry on." : null}
                    {m.card_last4 && m.status !== "failed" ? ` · Card ending ${m.card_last4}` : null}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3">
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

      <section className="rounded-card bg-surface border border-border p-5 space-y-3">
        <h2 className="font-semibold">Your s18A receipts</h2>
        {receipts && receipts.length > 0 ? (
          <ul className="space-y-2">
            {receipts.map((r) => (
              <li key={r.id} className="rounded-control border border-border p-3 text-sm">
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

      <section className="rounded-card bg-surface border border-border p-5 space-y-2">
        <h2 className="font-semibold">Tax packs</h2>
        <p className="text-sm text-muted">Every donation in a tax year, what goes on s18A receipts, and the totals. Save it as a PDF or a spreadsheet for your tax return.</p>
        <ul className="flex flex-wrap gap-2">
          {[0, 1, 2].map((back) => {
            const year = taxYearFor(new Date()) - back;
            return (
              <li key={year}>
                <Link href={`/account/tax-pack/${year}`} className="inline-block rounded-control border border-brand px-3 py-1.5 text-sm font-semibold text-brand">
                  Tax year {year}{back === 0 ? " so far" : ""}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {viewer.managedCharityIds.length > 0 || viewer.isPlatformAdmin ? (
        <section className="rounded-card bg-surface border border-border p-5 space-y-3">
          <h2 className="font-semibold">Manage</h2>
          {viewer.charities.map((c) => (
            <Link key={c.id} href={`/charity-admin/${c.id}`} className="block rounded-control border border-border p-3">
              <BilingualName en={c.name_en} he={c.name_he} />
            </Link>
          ))}
          {viewer.managedCharityIds.length > 0 && viewer.charities.length === 0 ? (
            <Link href="/charity-admin" className="block rounded-control border border-border p-3">
              Your charities (you&apos;ll be asked for your authenticator code)
            </Link>
          ) : null}
          {viewer.isPlatformAdmin ? (
            <Link href="/admin" className="block rounded-control border border-border p-3">
              Platform admin
            </Link>
          ) : null}
        </section>
      ) : null}

      <Link href="/account/data" className="block rounded-card border border-border bg-surface p-5 text-sm">
        <span className="font-semibold">Your information</span>
        <span className="block text-muted">Download it, or ask us to correct or delete it</span>
      </Link>

      <form action="/auth/signout" method="post">
        <button className="text-sm text-muted underline">Sign out</button>
      </form>
    </div>
  );
}
