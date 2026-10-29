import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/badge";
import { Card, Notice } from "@/components/card";
import { ActionLink, PageHeader, table } from "@/components/dash";
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
    <div className="space-y-5">
      <PageHeader
        back={<Link href={`${base}/deposits`} className="text-muted hover:text-brand">← Deposits</Link>}
        title={`Deposit of ${formatDate(`${d.paidOutOn}T12:00:00+02:00`)}`}
        intro={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-display text-2xl font-extrabold text-indigo tabular-nums">{formatRand(d.amountCents)}</span>
            {d.status === "pending" ? <Badge>On its way to your bank</Badge> : d.status === "failed" ? <Badge tone="danger">Payout failed</Badge> : <Badge tone="success">Paid to your bank</Badge>}
          </span>
        }
        actions={
          <>
            <ActionLink href={`${base}/deposits/${d.id}/csv`} download>CSV</ActionLink>
            <ActionLink href={`${base}/deposits/${d.id}/csv?format=xlsx`} download>Excel</ActionLink>
            {d.status === "paid" ? <ActionLink href={`${base}/deposits/${d.id}/csv?format=xero`} download>For Xero</ActionLink> : null}
          </>
        }
      />
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
        <div className={table.wrap}>
          <table className={`${table.table} min-w-[32rem]`}>
            <thead>
              <tr className={table.headRow}>
                <th className={table.th}>Donor</th>
                <th className={table.th}>What</th>
                <th className={`${table.th} text-right`}>Gift</th>
                <th className={`${table.th} text-right`}>Fee</th>
                <th className="pb-2 text-right font-bold">Reached the bank</th>
              </tr>
            </thead>
            <tbody>
              {dep.rows.map((r, i) => (
                <tr key={i} className={`${table.row} ${r.problem ? "bg-warning-soft" : ""}`}>
                  <td className={`${table.td} max-w-[12rem] truncate`}>
                    {r.donationId ? <Link href={`${base}/${r.donationId}`} className="font-semibold text-brand underline hover:text-indigo">{r.donorName}</Link> : r.donorName}
                  </td>
                  <td className={table.td}>{kindWord(r.kind)}</td>
                  <td className={`${table.td} text-right tabular-nums`}>{r.giftCents === null ? "?" : formatRand(r.giftCents)}</td>
                  <td className={`${table.td} text-right tabular-nums`}>{formatRand(r.feeCents)}</td>
                  <td className={table.num}>{formatRand(r.netCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-bold text-indigo">
                <td className={table.td} colSpan={2}>Deposit total</td>
                <td className={`${table.td} text-right tabular-nums`}>{formatRand(dep.giftsCents)}</td>
                <td className={`${table.td} text-right tabular-nums`}>{formatRand(dep.feesCents)}</td>
                <td className={table.num}>{formatRand(dep.netCents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <p className="text-xs text-muted">Fees are the payment provider&apos;s own, as it reports them. Each s18A receipt is for the full gift, not what reached the bank.</p>
    </div>
  );
}
