import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { Card, Notice } from "@/components/card";
import { requireViewer } from "@/lib/auth";
import { listDeposits } from "@/lib/charity/deposit-queries";
import type { Deposit } from "@/lib/charity/deposits";
import { loadCharityForManager } from "@/lib/charity/queries";
import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";

export const metadata: Metadata = { title: "Deposits" };

/**
 * Each deposit the payment provider made into the charity's bank account, with the gifts it is made of,
 * the fees taken off and what reached the bank (Juan, Angel Network, 21/10/2026).
 */
export default async function DepositsPage({ params }: PageProps<"/charity-admin/[id]/donations/deposits">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/donations/deposits`);
  await loadCharityForManager(id);
  const deposits = await listDeposits(id);
  const base = `/charity-admin/${id}/donations/deposits`;
  return (
    <div className="space-y-4">
      <Link href={`/charity-admin/${id}/donations`} className="text-sm text-muted">← Donations</Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-indigo">Deposits</h1>
          <p className="text-sm text-muted">
            The payment provider pays your gifts into your bank account in one deposit a day, with its fees taken off. Each deposit here shows the gifts it is made of,
            each fee, and what reached your bank, so it matches your bank statement line for line. s18A receipts are always for the full gift.
          </p>
        </div>
        {deposits.length ? <a href={`${base}/csv`} className="shrink-0 text-sm text-brand underline">Download all (CSV)</a> : null}
      </div>
      <Notice>Not in deposits: gifts you recorded yourself (EFT, cash), which never pass through the payment provider, and donors&apos; contributions to Givezy, which go to Givezy.</Notice>
      {deposits.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No deposits yet. They appear here a day or two after the payment provider pays your bank account, once gifts start coming in through Givezy.</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {deposits.map((d) => (
            <li key={d.id}>
              <Link href={`${base}/${d.id}`} className="block rounded-card border border-border bg-surface p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{formatDate(`${d.paidOutOn}T12:00:00+02:00`)}</p>
                    <p className="text-muted">
                      {summaryLine(d.deposit)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {d.status === "pending" ? <Badge>On its way</Badge> : d.status === "failed" ? <Badge tone="danger">Payout failed</Badge> : null}
                      {d.deposit.balances ? <Badge tone="success">Adds up</Badge> : <Badge tone="warning">Doesn&apos;t add up yet</Badge>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold">{formatRand(d.amountCents)}</p>
                    <p className="text-xs text-muted">to your bank</p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "3 gifts, R1 700, less R49.30 in fees", and anything taken back (a refund or chargeback), in plain words. */
function summaryLine(dep: Deposit): string {
  const gifts = dep.rows.filter((r) => r.kind === "payment");
  const back = dep.rows.filter((r) => r.kind === "refund" || r.kind === "chargeback");
  const giftCents = gifts.reduce((t, r) => t + (r.giftCents ?? 0), 0);
  const backCents = back.reduce((t, r) => t - (r.giftCents ?? r.netCents), 0);
  const parts: string[] = [];
  if (gifts.length) parts.push(`${gifts.length} ${gifts.length === 1 ? "gift" : "gifts"}, ${formatRand(giftCents)}`);
  if (back.length) parts.push(`${formatRand(backCents)} taken back (${back.length === 1 ? "a refund or chargeback" : `${back.length} refunds or chargebacks`})`);
  if (dep.feesCents) parts.push(`less ${formatRand(dep.feesCents)} in fees`);
  return parts.join(", ") || "Nothing in it";
}
