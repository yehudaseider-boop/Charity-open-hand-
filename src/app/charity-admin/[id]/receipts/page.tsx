import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { Card, Notice } from "@/components/card";
import { requireViewer } from "@/lib/auth";
import { canIssue18a } from "@/lib/charities";
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
  const { data: receipts, error } = await supabase
    .from("s18a_receipts")
    .select("id, tax_year, amount_cents, issued_at, status, pdf_path, emailed_at, reference:details->>receipt_reference, donor_name:details->donor->>name")
    .eq("charity_id", id)
    .order("issued_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const taxYear = thisTaxYear(new Date());

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">s18A receipts</h1>
      {canIssue18a(charity) ? (
        <Notice>
          One receipt is issued for each donor, once a year, after the tax year ends. The current tax year ({taxYearLabel(taxYear.taxYear)}) ends on {formatDate(taxYear.end)}.
          Each receipt lists that donor&apos;s paid donations to you and shows the donations only, not any contribution to NEDIV lev.
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
                  {r.status === "void" ? (
                    <Badge tone="warning">Withdrawn</Badge>
                  ) : r.pdf_path ? (
                    <div><Link href={`/receipts/${r.id}`} prefetch={false} className="text-brand underline">Download PDF</Link></div>
                  ) : (
                    <Badge>PDF on its way</Badge>
                  )}
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
      <p className="text-xs text-muted">If a receipt needs correcting, contact the platform team: only they can withdraw and re-issue one.</p>
    </div>
  );
}
