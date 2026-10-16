import type { Metadata } from "next";
import { Badge } from "@/components/badge";
import { Card, Notice } from "@/components/card";
import { requireViewer } from "@/lib/auth";
import { canIssue18a } from "@/lib/charities";
import { SupportContact } from "@/components/legal";
import { thisTaxYear } from "@/lib/charity/dashboard";
import { loadCharityForManager } from "@/lib/charity/queries";
import { formatDate, taxYearLabel } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Receipts" };

export default async function CharityReceiptsPage({ params }: PageProps<"/charity-admin/[id]/receipts">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/receipts`);
  const { charity } = await loadCharityForManager(id);
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
  const taxYear = thisTaxYear(new Date());

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-indigo">s18A receipts</h1>
      {canIssue18a(charity) ? (
        <Notice>
          One receipt is issued for each donor, once a year, after the tax year ends. The current tax year runs from {formatDate(taxYear.from)} to {formatDate(taxYear.end)} (SARS calls it tax year {taxYear.taxYear}).
          Each receipt lists that donor&apos;s paid donations to you and shows the donations only, not any contribution to Givezy.
        </Notice>
      ) : (
        <Notice tone="warning">
          Your charity can&apos;t issue s18A receipts yet: it needs confirmed s18A approval and a signed receipting mandate.
        </Notice>
      )}

      {receipts && receipts.length > 0 ? (
        <ul className="space-y-2">
          {receipts.map((r) => (
            <li key={r.id} className="rounded-card border border-border bg-surface p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{r.reference}</p>
                  <p className="truncate text-muted">{r.donor_name}</p>
                  <p className="text-muted">{taxYearLabel(r.tax_year)}</p>
                  <p className="text-muted">Issued {formatDate(r.issued_at)}</p>
                </div>
                <div className="shrink-0 space-y-1 text-right">
                  <p className="font-semibold">{formatRand(r.amount_cents)}</p>
                  {r.status === "void" ? <Badge tone="warning">Withdrawn</Badge> : <Badge tone="success">Issued</Badge>}
                  {r.status !== "void" ? <div>{r.emailed_at ? <Badge tone="success">Emailed</Badge> : <Badge>Not emailed</Badge>}</div> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
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
