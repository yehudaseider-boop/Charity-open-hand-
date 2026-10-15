"use client";

/**
 * Bank deposits: the bookkeeper's reconciliation view. One row per payment into the charity's bank
 * account, ticked off as it is found on the bank statement, with every donation and refund behind it.
 * Exports are plain CSV for any accounting package.
 */
import { useMemo, useState } from "react";
import { centsToPlain } from "@/lib/csv";
import { showDay } from "../data/day";
import { depositByFund, depositLines, donorName, statementRef } from "../data/selectors";
import type { DemoDataset, Payout } from "../data/types";
import { usePortal } from "../store";
import { count, date, permille, rand } from "../ui/format";
import { Icon } from "../ui/icons";
import { ConfirmDialog, Drawer } from "../ui/overlay";
import { Badge, Button, Callout, Card, CardHeader, DetailList, EmptyState, Progress, Segmented } from "../ui/primitives";
import { DataTable } from "../ui/table";
import { campaignName, useExport, useLookups } from "./common";

export function PayoutBadge({ status }: { status: Payout["status"] }) {
  return status === "paid" ? <Badge tone="success">In your bank</Badge> : <Badge tone="info" icon="clock">On its way</Badge>;
}

const yesNo = (b: boolean) => (b ? "Yes" : "No");

/** The three deposit exports. Every file adds up to the deposits it covers, to the cent. */
export function useDepositExports(data: DemoDataset, payouts: Payout[]) {
  const exportCsv = useExport();
  const lookups = useLookups(data);
  const { overrides } = usePortal();
  const matched = overrides.reconciled ?? {};
  return {
    deposits: () =>
      exportCsv(
        "bank-deposits",
        ["Date in bank", "Statement reference", "Payout", "Settlements from", "Settlements to", "Sent", "Donations", "Gross (R)", "Fees (R)", "Refunds (R)", "Net deposit (R)", "Status", "Matched on statement"],
        payouts.map((p) => [showDay(p.payoutDate), statementRef(p), p.ref, showDay(p.periodStart), showDay(p.periodEnd), showDay(p.sentDate), p.donationCount, centsToPlain(p.grossCents), centsToPlain(p.feesCents), centsToPlain(p.refundsCents), centsToPlain(p.netCents), p.status === "paid" ? "In bank" : "On its way", yesNo(!!matched[p.id])]),
      ),
    detail: () =>
      exportCsv(
        "bank-deposit-detail",
        ["Date in bank", "Statement reference", "Line", "Date", "Donation reference", "Donor", "Donor email", "Campaign (fund)", "Type", "Gross (R)", "Fee (R)", "Refund (R)", "Net (R)"],
        payouts.flatMap((p) =>
          depositLines(data, p).map((l) => {
            const donor = lookups.donor.get(l.donorId);
            const ref = data.donations.find((d) => d.id === l.donationId)?.ref ?? "";
            return [showDay(p.payoutDate), statementRef(p), l.kind === "donation" ? "Donation" : "Refund", showDay(l.day), ref, donorName(donor), donor?.email ?? "", campaignName(l.campaignId, lookups.campaign), l.donationKind === "monthly" ? "Monthly" : "Once-off", centsToPlain(l.grossCents), centsToPlain(l.feeCents), centsToPlain(l.refundCents), centsToPlain(l.netCents)];
          }),
        ),
      ),
    byFund: () =>
      exportCsv(
        "bank-deposits-by-campaign",
        ["Date in bank", "Statement reference", "Campaign (fund)", "Donations", "Gross (R)", "Fees (R)", "Refunds (R)", "Net (R)"],
        payouts.flatMap((p) => depositByFund(depositLines(data, p)).map((f) => [showDay(p.payoutDate), statementRef(p), campaignName(f.campaignId, lookups.campaign), f.count, centsToPlain(f.grossCents), centsToPlain(f.feeCents), centsToPlain(f.refundCents), centsToPlain(f.netCents)])),
      ),
  };
}

export function BankDepositsCard({ data, payouts, periodLabel }: { data: DemoDataset; payouts: Payout[]; periodLabel: string }) {
  const { overrides, markReconciled, toast } = usePortal();
  const matched = useMemo(() => overrides.reconciled ?? {}, [overrides.reconciled]);
  const [show, setShow] = useState<"all" | "todo" | "done">("all");
  const [open, setOpen] = useState<Payout | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const exports = useDepositExports(data, payouts);

  const inBank = payouts.filter((p) => p.status === "paid");
  const done = inBank.filter((p) => matched[p.id]).length;
  const rows = useMemo(() => payouts.filter((p) => (show === "all" ? true : show === "done" ? !!matched[p.id] : p.status === "paid" && !matched[p.id])), [payouts, show, matched]);
  const toDo = inBank.filter((p) => !matched[p.id]);

  const toggle = (p: Payout, on: boolean) => {
    markReconciled([p.id], on);
    toast({ tone: on ? "success" : "info", title: on ? `${showDay(p.payoutDate)} deposit matched` : "Match removed", body: on ? `${rand(p.netCents)} ticked off against your bank statement.` : undefined });
  };

  return (
    <Card>
      <CardHeader
        title="Bank deposits"
        subtitle={`One row for each payment into your bank account (${periodLabel}), by the date it arrives. Tick each one when you find it on your bank statement.`}
        action={
          <Button variant="secondary" size="sm" icon="download" onClick={exports.deposits}>
            Export deposits
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 rounded-2xl bg-gz-cream p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="text-sm font-semibold">
            {count(done)} of {count(inBank.length)} deposits matched on your bank statement
          </p>
          <Progress permille={inBank.length ? Math.round((done * 1000) / inBank.length) : 0} className="mt-2" label="Deposits matched" />
          <p className="mt-1.5 text-xs text-gz-muted">
            {inBank.length ? `${permille(Math.round((done * 1000) / inBank.length))} done.` : ""} Deposits still on their way can be matched once they arrive.
          </p>
        </div>
        {toDo.length > 0 && (
          <Button
            variant="soft"
            size="sm"
            icon="check"
            onClick={() => setConfirmAll(true)}
          >
            Mark all {count(toDo.length)} as matched
          </Button>
        )}
        <ConfirmDialog
          open={confirmAll}
          onClose={() => setConfirmAll(false)}
          onConfirm={() => {
            markReconciled(toDo.map((p) => p.id), true);
            toast({ tone: "success", title: `${count(toDo.length)} deposits matched`, body: "You can untick any of them again." });
          }}
          title={`Mark ${count(toDo.length)} deposits as matched?`}
          body={
            <>
              <p>
                {count(toDo.length)} deposits, {rand(toDo.reduce((t, p) => t + p.netCents, 0))} in total, from {toDo.length ? showDay(toDo.reduce((a, p) => (p.payoutDate < a ? p.payoutDate : a), toDo[0].payoutDate)) : ""} to {toDo.length ? showDay(toDo.reduce((a, p) => (p.payoutDate > a ? p.payoutDate : a), toDo[0].payoutDate)) : ""}.
              </p>
              <p className="mt-2">Only do this if you have checked each one against your bank statement.</p>
            </>
          }
          confirmLabel="Yes, I have checked them"
        />
      </div>

      <div className="mb-3">
        <Segmented
          label="Show deposits"
          size="sm"
          value={show}
          onChange={setShow}
          options={[
            { value: "all", label: "All" },
            { value: "todo", label: `To match (${count(toDo.length)})` },
            { value: "done", label: `Matched (${count(done)})` },
          ]}
        />
      </div>

      <DataTable
        caption="Bank deposits"
        rows={rows}
        rowKey={(p) => p.id}
        onRowClick={setOpen}
        rowLabel={(p) => `Open the deposit of ${showDay(p.payoutDate)}`}
        initialSort={{ key: "date", dir: "desc" }}
        pageSize={10}
        columns={[
          { key: "date", header: "Date in bank", sort: (p) => p.payoutDate, cell: (p) => <span className="font-semibold">{showDay(p.payoutDate)}</span> },
          { key: "ref", header: "Statement reference", cell: (p) => <span className="font-mono text-xs">{statementRef(p)}</span> },
          { key: "period", header: "Settlements", cell: (p) => `${showDay(p.periodStart).slice(0, 5)} to ${showDay(p.periodEnd)}`, wide: true },
          { key: "count", header: "Donations", align: "right", sort: (p) => p.donationCount, cell: (p) => count(p.donationCount), wide: true },
          { key: "gross", header: "Gross", align: "right", sort: (p) => p.grossCents, cell: (p) => rand(p.grossCents), wide: true },
          { key: "less", header: "Fees and refunds", align: "right", cell: (p) => <span className="text-gz-muted">− {rand(p.feesCents + p.refundsCents)}</span>, wide: true },
          { key: "net", header: "Deposit", align: "right", sort: (p) => p.netCents, cell: (p) => <span className="font-semibold text-gz-blue">{rand(p.netCents)}</span> },
          {
            key: "match",
            header: "Matched",
            align: "right",
            sort: (p) => (matched[p.id] ? 1 : 0),
            cell: (p) =>
              p.status === "paid" ? (
                <label className="inline-flex min-h-10 cursor-pointer items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" className="size-5 accent-[var(--gz-blue)]" checked={!!matched[p.id]} onChange={(e) => toggle(p, e.target.checked)} aria-label={`Matched the ${showDay(p.payoutDate)} deposit of ${rand(p.netCents)}`} />
                </label>
              ) : (
                <PayoutBadge status={p.status} />
              ),
          },
        ]}
        mobile={(p) => (
          <span className="flex items-center justify-between gap-3">
            <span>
              <span className="block font-semibold">{showDay(p.payoutDate)}</span>
              <span className="block font-mono text-xs text-gz-muted">{statementRef(p)}</span>
            </span>
            <span className="text-right">
              <span className="block font-semibold">{rand(p.netCents)}</span>
              {p.status === "paid" ? matched[p.id] ? <Badge tone="success">Matched</Badge> : <Badge tone="warning" icon={false}>To match</Badge> : <PayoutBadge status={p.status} />}
            </span>
          </span>
        )}
        empty={<EmptyState icon="bank" title={show === "all" ? "No deposits in this period" : show === "todo" ? "Nothing left to match" : "Nothing matched yet"} body={show === "all" ? "Choose a longer date range." : undefined} />}
      />

      {open && <DepositDrawer payout={open} data={data} matchedOn={matched[open.id] ?? null} onToggle={(on) => toggle(open, on)} onClose={() => setOpen(null)} />}
    </Card>
  );
}

function DepositDrawer({ payout, data, matchedOn, onToggle, onClose }: { payout: Payout; data: DemoDataset; matchedOn: string | null; onToggle: (on: boolean) => void; onClose: () => void }) {
  const lookups = useLookups(data);
  const lines = useMemo(() => depositLines(data, payout), [data, payout]);
  const funds = useMemo(() => depositByFund(lines), [lines]);
  const donations = lines.filter((l) => l.kind === "donation");
  const refunds = lines.filter((l) => l.kind === "refund");
  const exports = useDepositExports(data, [payout]);
  return (
    <Drawer
      open
      onClose={onClose}
      title={rand(payout.netCents)}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-2">
          <PayoutBadge status={payout.status} />
          {matchedOn && <Badge tone="success">Matched {showDay(matchedOn)}</Badge>}
          <span className="font-mono text-xs">{statementRef(payout)}</span>
        </span>
      }
      footer={
        <>
          {payout.status === "paid" && (
            <Button variant={matchedOn ? "ghost" : "primary"} size="sm" icon={matchedOn ? "x" : "check"} onClick={() => onToggle(!matchedOn)}>
              {matchedOn ? "Remove match" : "Matched on my statement"}
            </Button>
          )}
          <Button variant="secondary" size="sm" icon="download" onClick={exports.detail}>
            Export lines
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <DetailList
          items={[
            ["In your bank", showDay(payout.payoutDate)],
            ["On your statement as", <span key="r" className="font-mono text-xs">{statementRef(payout)}</span>],
            ["Settlements", `${showDay(payout.periodStart)} to ${showDay(payout.periodEnd)}`],
            ["Sent", showDay(payout.sentDate)],
            ["Bank account", `${data.charity.bankName} ending ${data.charity.bankLast4}`],
          ]}
        />
        <div>
          <h3 className="mb-1 text-base">How it adds up</h3>
          <DetailList
            items={[
              [`${count(payout.donationCount)} donations (gross)`, rand(payout.grossCents)],
              ["Fees", `− ${rand(payout.feesCents)}`],
              [`Refunds made that week (${refunds.length})`, `− ${rand(payout.refundsCents)}`],
              ["Paid into your bank", <span key="n" className="text-gz-blue">{rand(payout.netCents)}</span>],
            ]}
          />
        </div>
        <div>
          <h3 className="mb-2 text-base">By campaign</h3>
          <p className="mb-2 text-xs text-gz-muted">For your accounts: one line per campaign, adding up to the deposit.</p>
          <table className="w-full text-sm">
            <caption className="sr-only">Deposit split by campaign</caption>
            <thead>
              <tr className="text-left text-xs text-gz-muted">
                <th className="pb-1.5 font-semibold">Campaign</th>
                <th className="pb-1.5 text-right font-semibold">Gross</th>
                <th className="pb-1.5 text-right font-semibold">Less</th>
                <th className="pb-1.5 text-right font-semibold">Net</th>
              </tr>
            </thead>
            <tbody>
              {funds.map((f) => (
                <tr key={f.campaignId ?? "general"} className="border-t border-gz-hairline/70">
                  <td className="py-1.5 pr-2">{campaignName(f.campaignId, lookups.campaign)}</td>
                  <td className="whitespace-nowrap py-1.5 text-right">{rand(f.grossCents)}</td>
                  <td className="whitespace-nowrap py-1.5 text-right text-gz-muted">− {rand(f.feeCents + f.refundCents)}</td>
                  <td className="whitespace-nowrap py-1.5 text-right font-semibold">{rand(f.netCents)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gz-ink/20 font-semibold">
                <td className="py-2">Deposit</td>
                <td />
                <td />
                <td className="whitespace-nowrap py-2 text-right text-gz-blue">{rand(payout.netCents)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {refunds.length > 0 && (
          <Callout tone="neutral" title={`${refunds.length === 1 ? "A refund was" : `${refunds.length} refunds were`} taken off this deposit`}>
            {refunds.map((l) => `${donorName(lookups.donor.get(l.donorId))}, ${rand(l.refundCents)} on ${showDay(l.day)}`).join("; ")}.
          </Callout>
        )}
        <div>
          <h3 className="mb-2 text-base">Donations in this deposit</h3>
          <ul className="divide-y divide-gz-hairline rounded-2xl border border-gz-hairline bg-gz-surface px-3">
            {donations.slice(0, 30).map((l) => {
              const d = data.donations.find((x) => x.id === l.donationId);
              return (
                <li key={l.donationId} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{donorName(lookups.donor.get(l.donorId))}</span>
                    <span className="block text-xs text-gz-muted">
                      Donated {d ? date(d.donatedAt) : showDay(l.day)} · {campaignName(l.campaignId, lookups.campaign)}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold">{rand(l.grossCents)}</span>
                    <span className="block text-xs text-gz-muted">net {rand(l.netCents)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {donations.length > 30 && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-gz-muted">
              <Icon name="info" size={13} /> Showing 30 of {count(donations.length)}. Export lines lists them all.
            </p>
          )}
        </div>
      </div>
    </Drawer>
  );
}
