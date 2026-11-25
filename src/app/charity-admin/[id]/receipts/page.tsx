import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { Card, Notice } from "@/components/card";
import { ActionLink, PageHeader } from "@/components/dash";
import { requireViewer } from "@/lib/auth";
import { canIssue18a } from "@/lib/charities";
import { SupportContact } from "@/components/legal";
import { thisTaxYear } from "@/lib/charity/dashboard";
import { loadCharityForManager } from "@/lib/charity/queries";
import { loadReceiptGifts } from "@/lib/charity/dashboard-queries";
import { receiptProgress } from "@/lib/charity/insights";
import { formatDate, taxYearLabel, taxYearName } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { DonePanel } from "@/components/done-panel";
import { closedTaxYears, listRuns, loadPlan, pendingAtYearEnd } from "@/lib/receipts/runs";
import { YearRun } from "./year-run";
import { viewerCan } from "@/lib/charity/team";

export const metadata: Metadata = { title: "s18A receipts" };

// The sign-off issues, prints and emails every receipt in one go (its actions run under this page's limit).
// 60 seconds is safe on any hosting plan; raise it (up to 300) once on a plan that allows it.
export const maxDuration = 60;

export default async function CharityReceiptsPage({ params, searchParams }: PageProps<"/charity-admin/[id]/receipts">) {
  const { id } = await params;
  const sp = await searchParams;
  await requireViewer(`/charity-admin/${id}/receipts`);
  const { charity } = await loadCharityForManager(id);
  const canDownload = await viewerCan(id, "export");
  const canCheck = await viewerCan(id, "receipts");
  const supabase = await createClient();
  // Every receipt, read page by page (the database answers at most 1 000 rows at a time).
  // A narrow view: no part of the donor's ID or tax number reaches the charity.
  const receipts: { id: string; tax_year: number; amount_cents: number; issued_at: string; status: string; emailed_at: string | null; reference: string; donor_name: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("charity_receipts")
      .select("id, tax_year, amount_cents, issued_at, status, emailed_at, reference, donor_name")
      .eq("charity_id", id)
      .order("issued_at", { ascending: false })
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    receipts.push(...((data ?? []) as typeof receipts));
    if (!data || data.length < 1000) break;
  }
  const issuedYears = [...new Set(receipts.filter((r) => r.status === "issued").map((r) => r.tax_year))].sort((a, b) => b - a);
  const taxYear = thisTaxYear(new Date());
  const { gifts, onIssued } = await loadReceiptGifts(id);
  const progress = receiptProgress(gifts, onIssued, taxYear.taxYear);
  // The yearly run: for each closed tax year, the list to approve, or where its approval stands.
  const runs = canIssue18a(charity) ? await listRuns(id) : [];
  const years = canIssue18a(charity)
    ? await Promise.all(
        closedTaxYears(new Date()).map(async (y) => {
          const open = runs.find((r) => r.tax_year === y && (r.status === "charity_approved" || r.status === "issuing")) ?? null;
          const latest = runs.find((r) => r.tax_year === y) ?? null;
          const plan = open ? null : await loadPlan(id, y);
          const pending = plan && plan.toIssue ? await pendingAtYearEnd(id, y) : 0;
          return { taxYear: y, open, latest, plan, pending };
        }),
      )
    : [];

  return (
    <div className="space-y-5">
      <DonePanel charity={charity} sp={sp} here={`/charity-admin/${id}/receipts`} />
      {!canCheck ? <Notice>Your role doesn&apos;t include approving or declining s18A receipts. You can see them here.</Notice> : null}
      <PageHeader title="s18A receipts" actions={issuedYears.length ? <ActionLink href={`/charity-admin/${id}/receipts/sars`}>SARS submission (IT3(d))</ActionLink> : undefined} />
      {sp.receipt === "unavailable" ? <p role="status" className="rounded-control bg-warning-soft p-3 text-sm text-warning">That s18A receipt PDF isn&apos;t available. It may have been withdrawn, or its PDF is not ready yet.</p> : null}
      {canIssue18a(charity) ? (
        <Notice>
          One receipt is issued for each donor, once a year, after the tax year ends. The current tax year runs from {formatDate(taxYear.from)} to {formatDate(taxYear.end)} (SARS calls it tax year {taxYear.taxYear}).
          Each receipt lists that donor&apos;s paid donations to you and shows the donations only, not any contribution to Givezy.
        </Notice>
      ) : (
        <Notice tone="warning">
          Your charity can&apos;t issue s18A receipts yet: it needs confirmed s18A approval and a signed receipting mandate.{" "}
          {/* The way on (journey walk-through, 25/11/2026: this said what was missing but not how to fix it). */}
          {charity.status === "draft" || charity.status === "rejected" ? (
            <>Add them under <Link href={`/charity-admin/${id}/application?step=documents`} className="font-semibold underline underline-offset-4">Documents</Link> in your application.</>
          ) : (
            <>Send us your SARS s18A approval letter and your signed mandate, and we&apos;ll set up receipts: <SupportContact />.</>
          )}
        </Notice>
      )}

      {years.map((y) => (
        <YearRun key={y.taxYear} charityId={id} canCheck={canCheck} {...y} />
      ))}

      {progress.length > 0 ? (
        <Card title="Who has a receipt">
          <ul className="divide-y divide-border text-sm">
            {progress.map((y) => (
              <li key={y.taxYear} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="font-semibold text-indigo">{y.current ? `${taxYearName(y.taxYear)} tax year so far` : taxYearLabel(y.taxYear)}</p>
                  <p className="text-muted">
                    {y.donors} {y.donors === 1 ? "donor" : "donors"} asked for an s18A receipt
                    {y.current
                      ? `. Receipts are issued after ${formatDate(taxYear.end)}.`
                      : y.receipted === y.donors
                        ? ", and every one has it."
                        : `: ${y.receipted} receipted, ${y.donors - y.receipted} still to come.`}
                  </p>
                </div>
                {y.waitingCents > 0 ? (
                  <div className="shrink-0 text-right">
                    <p className="font-display text-lg font-extrabold tabular-nums text-indigo">{formatRand(y.waitingCents)}</p>
                    <p className="text-xs text-muted">{y.current ? "to be receipted" : "not receipted yet"}</p>
                  </div>
                ) : (
                  <Badge tone="success">All receipted</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {issuedYears.length ? (
        <Card lights title="Yearly list">
          <p className="mb-2 text-sm text-muted">
            Every s18A receipt issued for a tax year, with what SARS will want that is missing (an address, or an ID number).
            For your records. It shows whether an ID or tax number is on file, never the number. The files for SARS itself are on{" "}
            <Link href={`/charity-admin/${id}/receipts/sars`} className="text-brand underline">SARS submission (IT3(d))</Link>.
          </p>
          <ul className="divide-y divide-border text-sm">
            {issuedYears.map((y) => (
              <li key={y} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                <span className="font-semibold text-indigo">{taxYearLabel(y)}</span>
                <span className="flex flex-wrap gap-2">
                  {canDownload ? <ActionLink download href={`/charity-admin/${id}/receipts/year-list?year=${y}`}>CSV</ActionLink> : null}
                  {canDownload ? <ActionLink download href={`/charity-admin/${id}/receipts/year-list?year=${y}&format=xlsx`}>Excel</ActionLink> : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {receipts && receipts.length > 0 ? (
        <Card>
          <ul className="divide-y divide-border text-sm">
            {receipts.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="font-semibold text-indigo [overflow-wrap:anywhere]">{r.reference}</p>
                  <p className="truncate text-muted" dir="auto">{r.donor_name}</p>
                  <p className="text-muted">{taxYearLabel(r.tax_year)}</p>
                  <p className="text-muted">Issued {formatDate(r.issued_at)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                  <p className="font-display text-lg font-extrabold tabular-nums text-indigo">{formatRand(r.amount_cents)}</p>
                  {r.status === "void" ? <Badge tone="warning">Withdrawn</Badge> : <Badge tone="success">Issued</Badge>}
                  {r.status !== "void" ? <div>{r.emailed_at ? <Badge tone="success">Emailed</Badge> : <Badge>Not emailed</Badge>}</div> : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-muted">No receipts have been issued yet. They appear here once the tax year has ended and receipts have been issued.</p>
        </Card>
      )}
      <p className="text-xs text-muted">
        The receipt itself goes to the donor (it shows their ID or tax number, which charities don&apos;t see). If a receipt needs correcting,
        tell us (<SupportContact />): only we can withdraw and re-issue one.
      </p>
    </div>
  );
}
