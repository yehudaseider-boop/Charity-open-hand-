import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/badge";
import { Card, Notice } from "@/components/card";
import { SupportContact } from "@/components/legal";
import { requireViewer } from "@/lib/auth";
import { loadDeposit } from "@/lib/charity/deposit-queries";
import { kindWord } from "@/lib/charity/deposits";
import { loadCharityForManager } from "@/lib/charity/queries";
import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";

export const metadata: Metadata = { title: "Deposit" };

/** One deposit, line by line, ending in a total that equals the bank deposit. */
export default async function DepositPage({ params }: PageProps<"/charity-admin/[id]/donations/deposits/[payoutId]">) {
  const { id, payoutId } = await params;
  await requireViewer(`/charity-admin/${id}/donations/deposits/${payoutId}`);
  await loadCharityForManager(id);
  const d = await loadDeposit(id, payoutId);
  if (!d) notFound();
  const dep = d.deposit;
  const base = `/charity-admin/${id}/donations`;
  return (
    <div className="space-y-4">
      <Link href={`${base}/deposits`} className="text-sm text-muted">← Deposits</Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-indigo">Deposit of {formatDate(`${d.paidOutOn}T12:00:00+02:00`)}</h1>
          <p className="text-2xl font-semibold">{formatRand(d.amountCents)}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {d.status === "pending" ? <Badge>On its way to your bank</Badge> : d.status === "failed" ? <Badge tone="danger">Payout failed</Badge> : <Badge tone="success">Paid to your bank</Badge>}
          </div>
        </div>
        <p className="shrink-0 space-x-3 text-sm">
          <a href={`${base}/deposits/${d.id}/csv`} className="text-brand underline">CSV</a>
          <a href={`${base}/deposits/${d.id}/csv?format=xlsx`} className="text-brand underline">Excel</a>
          {d.status === "paid" ? <a href={`${base}/deposits/${d.id}/csv?format=xero`} className="text-brand underline">For Xero</a> : null}
        </p>
      </div>
      {dep.balances ? (
        <Notice tone="success">Every line adds up, and the lines add up to the deposit of {formatRand(d.amountCents)}.</Notice>
      ) : (
        <Notice tone="warning">
          <span className="block font-medium">This deposit doesn&apos;t add up yet.</span>
          {dep.problems.map((p, i) => <span key={i} className="mt-1 block">{p}</span>)}
          <span className="mt-1 block">Tell us: <SupportContact /></span>
        </Notice>
      )}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">Donor</th>
                <th className="py-1 pr-3 font-medium">What</th>
                <th className="py-1 pr-3 text-right font-medium">Gift</th>
                <th className="py-1 pr-3 text-right font-medium">Fee</th>
                <th className="py-1 text-right font-medium">Reached the bank</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dep.rows.map((r, i) => (
                <tr key={i} className={r.problem ? "bg-warning-soft" : undefined}>
                  <td className="max-w-[12rem] truncate py-1.5 pr-3">
                    {r.donationId ? <Link href={`${base}/${r.donationId}`} className="text-brand underline">{r.donorName}</Link> : r.donorName}
                  </td>
                  <td className="py-1.5 pr-3">{kindWord(r.kind)}</td>
                  <td className="py-1.5 pr-3 text-right">{r.giftCents === null ? "?" : formatRand(r.giftCents)}</td>
                  <td className="py-1.5 pr-3 text-right">{formatRand(r.feeCents)}</td>
                  <td className="py-1.5 text-right font-medium">{formatRand(r.netCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-semibold">
                <td className="py-1.5 pr-3" colSpan={2}>Deposit total</td>
                <td className="py-1.5 pr-3 text-right">{formatRand(dep.giftsCents)}</td>
                <td className="py-1.5 pr-3 text-right">{formatRand(dep.feesCents)}</td>
                <td className="py-1.5 text-right">{formatRand(dep.netCents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <p className="text-xs text-muted">Fees are the payment provider&apos;s own, as it reports them. Each s18A receipt is for the full gift, not what reached the bank.</p>
    </div>
  );
}
