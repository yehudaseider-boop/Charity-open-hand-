import type { Metadata } from "next";
import { Badge } from "@/components/badge";
import { Card, Notice } from "@/components/card";
import { requireViewer } from "@/lib/auth";
import { canIssue18a } from "@/lib/charities";
import { SupportContact } from "@/components/legal";
import { thisTaxYear } from "@/lib/charity/dashboard";
import { loadCharityForManager } from "@/lib/charity/queries";
import { loadReceiptGifts } from "@/lib/charity/dashboard-queries";
import { receiptProgress } from "@/lib/charity/insights";
import { formatDate, taxYearLabel } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { DonePanel } from "@/components/done-panel";
import { closedTaxYears, listRuns, loadPlan, pendingAtYearEnd, type Plan, type ReceiptRun } from "@/lib/receipts/runs";
import { approveReceipts, withdrawReceipts } from "./actions";
import { ApproveReceiptsForm, WithdrawReceiptsForm } from "./forms";

export const metadata: Metadata = { title: "s18A receipts" };

export default async function CharityReceiptsPage({ params, searchParams }: PageProps<"/charity-admin/[id]/receipts">) {
  const { id } = await params;
  const sp = await searchParams;
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
          const pending = plan && plan.lines.length ? await pendingAtYearEnd(id, y) : 0;
          return { taxYear: y, open, latest, plan, pending };
        }),
      )
    : [];

  return (
    <div className="space-y-4">
      <DonePanel charity={charity} sp={sp} here={`/charity-admin/${id}/receipts`} />
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

      {years.map((y) => (
        <YearRun key={y.taxYear} charityId={id} {...y} />
      ))}

      {progress.length > 0 ? (
        <Card>
          <h2 className="font-display text-lg text-indigo">Who has a receipt</h2>
          <ul className="mt-2 divide-y divide-border text-sm">
            {progress.map((y) => (
              <li key={y.taxYear} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium">{y.current ? `Tax year ${y.taxYear} so far` : taxYearLabel(y.taxYear)}</p>
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
                    <p className="font-semibold">{formatRand(y.waitingCents)}</p>
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

/** One closed tax year: its list of receipts to approve, or where the approval stands. */
function YearRun({ charityId, taxYear, open, latest, plan, pending }: { charityId: string; taxYear: number; open: ReceiptRun | null; latest: ReceiptRun | null; plan: Plan | null; pending: number }) {
  if (open) {
    return (
      <Card title={`${taxYearLabel(taxYear)}: approved`}>
        <div className="space-y-3 text-sm">
          {open.status === "issuing" ? (
            <p>Givezy has signed it off and the receipts are being issued now. Each donor gets theirs by email.</p>
          ) : (
            <p>
              You approved {open.receipts_planned} {open.receipts_planned === 1 ? "receipt" : "receipts"}, {formatRand(open.total_cents)} in all, on {formatDate(open.charity_approved_at)}.
              It&apos;s waiting for Givezy to check it and sign it off. Nothing has been issued yet.
            </p>
          )}
          {open.status === "charity_approved" ? <WithdrawReceiptsForm action={withdrawReceipts.bind(null, charityId, open.id)} /> : null}
        </div>
      </Card>
    );
  }
  if (!plan || plan.lines.length === 0) {
    if (latest?.status !== "done") return null;
    const s = latest.summary;
    return (
      <Card title={`${taxYearLabel(taxYear)}: issued`}>
        <p className="text-sm">
          {s ? `${s.issued} ${s.issued === 1 ? "receipt" : "receipts"} issued` : "Receipts issued"} on {formatDate(latest.signed_off_at ?? latest.finished_at ?? latest.charity_approved_at)}
          {s ? `, ${s.emailed} emailed to donors so far.` : "."} You can see each one in the list below.
        </p>
      </Card>
    );
  }
  // Sent back by Givezy (not withdrawn by the charity itself): say why.
  const sentBack = latest?.status === "cancelled" && latest.cancelled_reason && latest.cancelled_reason !== "The charity took back its approval." ? latest.cancelled_reason : null;
  const total = formatRand(plan.totalCents);
  return (
    <Card title={`${taxYearLabel(taxYear)}: ready to approve`}>
      <div className="space-y-3 text-sm">
        {sentBack ? <Notice tone="warning">Your earlier approval came back from Givezy. {sentBack}</Notice> : null}
        <p>
          The tax year has ended. These donors asked for an s18A receipt. Check the names and amounts, then approve the list. Givezy signs it off after you,
          and then each donor gets their receipt by email.
        </p>
        {pending > 0 ? (
          <Notice tone="warning">
            {pending} s18A {pending === 1 ? "payment" : "payments"} from the last days of the tax year {pending === 1 ? "is" : "are"} still waiting for the payment provider.
            If {pending === 1 ? "it goes" : "they go"} through after you approve, that donor&apos;s receipt has to be withdrawn and issued again, so you may want to wait a day or two.
          </Notice>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">Donor</th>
                <th className="py-1 pr-3 font-medium">Donations</th>
                <th className="py-1 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {plan.lines.map((l, i) => (
                <tr key={i}>
                  <td className="max-w-[16rem] truncate py-1.5 pr-3">{l.donorName}</td>
                  <td className="py-1.5 pr-3">{l.gifts}</td>
                  <td className="py-1.5 text-right font-medium">{formatRand(l.totalCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-semibold">
                <td className="py-1.5 pr-3" colSpan={2}>
                  {plan.lines.length} {plan.lines.length === 1 ? "receipt" : "receipts"}
                </td>
                <td className="py-1.5 text-right">{total}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs text-muted">Amounts are the donations only, never a contribution to Givezy. A name looks wrong, or someone is missing? Don&apos;t approve yet: tell us (<SupportContact />).</p>
        <ApproveReceiptsForm action={approveReceipts.bind(null, charityId, taxYear, plan.fingerprint)} count={plan.lines.length} total={total} />
      </div>
    </Card>
  );
}
