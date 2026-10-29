import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { Card, Notice } from "@/components/card";
import { ActionLink, EmptyState, PageHeader, rowLink } from "@/components/dash";
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
    <div className="space-y-5">
      <PageHeader
        back={<Link href={`/charity-admin/${id}/donations`} className="text-muted hover:text-brand">← Donations</Link>}
        title="Deposits"
        intro={
          <>
            The payment provider pays your gifts into your bank account in one deposit a day, with its fees taken off. Each deposit here shows the gifts it is made of,
            each fee, and what reached your bank, so it matches your bank statement line for line. s18A receipts are always for the full gift.
          </>
        }
        actions={
          deposits.length ? (
            <div role="group" aria-label="Download all" className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-muted">Download all</span>
              <ActionLink href={`${base}/csv`} download>CSV</ActionLink>
              <ActionLink href={`${base}/csv?format=xlsx`} download>Excel</ActionLink>
              <ActionLink href={`${base}/csv?format=xero`} download>For Xero</ActionLink>
            </div>
          ) : null
        }
      />
      {deposits.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-brand hover:underline">Using Xero?</summary>
          <p className="mt-2 text-muted">
            &quot;For Xero&quot; is a bank statement file for a clearing account in Xero (for example &quot;Givezy donations&quot;). Each deposit becomes the donations in,
            the card fees out and the deposit out to your bank, so the clearing account comes back to zero and the deposit matches the line on your real bank feed.
            In Xero: Accounting, Bank accounts, your clearing account, Import a statement. Ask your bookkeeper to set up the clearing account once.
          </p>
        </details>
      ) : null}
      <Notice>Not in deposits: gifts you recorded yourself (EFT, cash), which never pass through the payment provider, and donors&apos; contributions to Givezy, which go to Givezy.</Notice>
      {deposits.length === 0 ? (
        <EmptyState title="No deposits yet">They appear here a day or two after the payment provider pays your bank account, once gifts start coming in through Givezy.</EmptyState>
      ) : (
        <Card lights>
        <ul className="divide-y divide-border">
          {deposits.map((d) => (
            <li key={d.id} className="py-1 first:pt-0 last:pb-0">
              <Link href={`${base}/${d.id}`} className={`${rowLink} items-start text-sm`}>
                  <div className="min-w-0">
                    <p className="font-semibold text-indigo group-hover:text-brand group-hover:underline">{formatDate(`${d.paidOutOn}T12:00:00+02:00`)}</p>
                    <p className="text-muted">
                      {summaryLine(d.deposit)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {d.status === "pending" ? <Badge>On its way</Badge> : d.status === "failed" ? <Badge tone="danger">Payout failed</Badge> : null}
                      {d.deposit.balances ? <Badge tone="success">Adds up</Badge> : <Badge tone="warning">Doesn&apos;t add up yet</Badge>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display text-lg font-bold text-indigo tabular-nums">{formatRand(d.amountCents)}</p>
                    <p className="text-xs text-muted">to your bank</p>
                  </div>
              </Link>
            </li>
          ))}
        </ul>
        </Card>
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
