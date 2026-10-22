import { HebrewAware } from "@/components/hebrew-aware";
import Link from "next/link";
import { platformConfig } from "@/config/platform";
import { formatDate, taxYearLabel } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import type { TaxPack } from "@/lib/tax-pack/build";
import { PrintButton } from "./print-button";


/** What the tax pack page shows, from a built pack. Separate from the loading so it can be previewed with sample data. */
export function TaxPackView({ year, email, pack, current }: { year: number; email: string; pack: TaxPack | null; current: number }) {
  const yearOpen = year >= current;
  return (
    <div className="space-y-5 print:space-y-4 print:text-[10pt]">
      {/* The site header is hidden when printing, so the logo goes on the page itself. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt={platformConfig.appName} width={97} height={32} className="hidden h-8 w-auto print:block" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">Tax pack {year}</h1>
          <p className="text-sm text-muted">{taxYearLabel(year).replace(/^Tax year \d+ /, "").replace(/[()]/g, "")}</p>
          <p className="text-sm text-muted break-all">{email} · made on {formatDate(new Date())}</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <PrintButton />
          <a href={`/account/tax-pack/${year}/csv`} className="rounded-control border border-brand px-4 py-2 font-semibold text-brand">Spreadsheet</a>
        </div>
      </div>

      {yearOpen ? (
        <p className="rounded-control bg-honey-soft p-3 text-sm">This tax year is still open: the pack shows the donations so far. s18A receipts come after it closes.</p>
      ) : null}

      {!pack || pack.lines.length === 0 ? (
        <section className="rounded-card border border-border bg-surface p-5">
          <h2 className="font-semibold">No donations in this tax year</h2>
          <p className="mt-1 text-sm text-muted">Paid donations made with this account between those dates appear here.</p>
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-card bg-brand-soft p-4">
              <p className="text-sm font-semibold text-indigo">Total given</p>
              <p className="font-display text-3xl font-semibold text-indigo">{formatRand(pack.totalCents)}</p>
              <p className="text-sm text-muted">{pack.lines.length} {pack.lines.length === 1 ? "donation" : "donations"}</p>
            </div>
            {yearOpen || pack.receipts.length === 0 ? (
              <>
                <div className="rounded-card border border-border bg-surface p-4">
                  <p className="text-sm font-semibold text-success">s18A receipt asked for</p>
                  <p className="font-display text-3xl font-semibold">{formatRand(pack.s18aCents)}</p>
                  <p className="text-sm text-muted">{yearOpen ? "Receipts come after the tax year closes" : "Receipts not issued yet"}</p>
                </div>
                <div className="rounded-card border border-border bg-surface p-4">
                  <p className="text-sm font-semibold text-muted">No s18A receipt asked for</p>
                  <p className="font-display text-3xl font-semibold">{formatRand(pack.otherCents)}</p>
                  <p className="text-sm text-muted">Not tax-deductible</p>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-card border border-border bg-surface p-4">
                  <p className="text-sm font-semibold text-success">On your s18A receipts</p>
                  <p className="font-display text-3xl font-semibold">{formatRand(pack.receiptedCents)}</p>
                  <p className="text-sm text-muted">{pack.receipts.length} {pack.receipts.length === 1 ? "receipt" : "receipts"} issued</p>
                </div>
                <div className="rounded-card border border-border bg-surface p-4">
                  <p className="text-sm font-semibold text-muted">Not on an s18A receipt</p>
                  <p className="font-display text-3xl font-semibold">{formatRand(pack.totalCents - pack.receiptedCents)}</p>
                  <p className="text-sm text-muted">Not tax-deductible</p>
                </div>
              </>
            )}
          </section>

          <section className="rounded-card border border-border bg-surface p-5 print:break-inside-avoid">
            <h2 className="font-semibold">By charity</h2>
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-left text-muted"><th className="py-1 font-medium">Charity</th><th className="hidden py-1 text-right font-medium sm:table-cell print:table-cell">Donations</th><th className="py-1 pl-2 text-right font-medium">s18A</th><th className="py-1 pl-2 text-right font-medium">Total</th></tr></thead>
              <tbody>
                {pack.byCharity.map((c) => (
                  <tr key={c.name} className="border-t border-border">
                    <td className="py-2 pr-2">{c.name}</td>
                    <td className="hidden py-2 text-right tabular-nums sm:table-cell print:table-cell">{c.count}</td>
                    <td className="py-2 pl-2 text-right whitespace-nowrap tabular-nums">{c.s18aCents ? formatRand(c.s18aCents) : "None"}</td>
                    <td className="py-2 pl-2 text-right font-medium whitespace-nowrap tabular-nums">{formatRand(c.cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm text-muted">
              {pack.byLabel.map((t) => `${t.label} ${formatRand(t.cents)}`).join(" · ")}. Your own labels: only you see these.
            </p>
          </section>

          <section className="rounded-card border border-border bg-surface p-5 print:break-inside-avoid">
            <h2 className="font-semibold">s18A receipts issued</h2>
            {pack.receipts.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {pack.receipts.map((r) => (
                  <li key={`${r.charityName}-${r.reference}`} className="flex flex-wrap justify-between gap-2 border-t border-border pt-1">
                    <span>{r.charityName}{r.reference ? `, no. ${r.reference}` : ""}, issued {formatDate(r.issuedAt)}</span>
                    <span className="font-medium whitespace-nowrap tabular-nums">{formatRand(r.cents)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted">{yearOpen ? "None yet: receipts come after the tax year closes." : "None for this tax year."}</p>
            )}
          </section>

          <section className="rounded-card border border-border bg-surface p-5">
            <h2 className="font-semibold">Every donation</h2>
            <ul className="mt-2 text-sm">
              {pack.lines.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 border-t border-border py-2 print:break-inside-avoid">
                  <div>
                    <p>{l.charityName}</p>
                    <p className="text-xs text-muted">
                      <span className="tabular-nums">{formatDate(l.paidAt)}</span> · {l.label ?? "No label"}{l.monthly ? " · monthly" : ""} · {l.receipted ? "on an s18A receipt" : l.s18a ? (yearOpen || pack.receipts.length === 0 ? "s18A receipt asked for" : "asked for, not on a receipt") : "no s18A receipt"}
                      {l.dedication ? <span className="block" dir="auto"><HebrewAware text={l.dedication} /></span> : null}
                    </p>
                  </div>
                  <p className="whitespace-nowrap font-medium tabular-nums">{formatRand(l.cents)}</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <p className="text-xs text-muted">
        A summary of your donations through {platformConfig.appName}, for your own records. It is not a tax receipt: for tax purposes use the s18A receipts
        each charity issues. Donations only: any contribution to {platformConfig.appName} is a separate payment and is not listed. Dates are in South African time.
      </p>

      <nav className="flex flex-wrap gap-4 text-sm print:hidden">
        {year > 2020 ? <Link href={`/account/tax-pack/${year - 1}`} className="text-brand underline">Tax pack {year - 1}</Link> : null}
        {year < current ? <Link href={`/account/tax-pack/${year + 1}`} className="text-brand underline">Tax pack {year + 1}</Link> : null}
        <Link href="/account" className="text-brand underline">Back to your account</Link>
      </nav>
    </div>
  );
}
