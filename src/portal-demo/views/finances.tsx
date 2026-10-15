"use client";

import { useMemo } from "react";
import { centsToPlain } from "@/lib/csv";
import { DEMO_PAYOUT_SCHEDULE, DEMO_TODAY } from "../data/demo-config";
import { addDays, showDay, showMonth, weekday } from "../data/day";
import { localDay } from "../data/generate";
import { dayOf, donorName, financeSummary, inRange, monthsIn, pendingSettlement, RANGE_LABELS, reversedAt, visibleToCharity } from "../data/selectors";
import type { DemoDataset } from "../data/types";
import { usePortal } from "../store";
import { DateRangePicker } from "../ui/date-range";
import { count, date, rand } from "../ui/format";
import { Icon, type IconName } from "../ui/icons";
import { MetricCard } from "../ui/metric";
import { Badge, Button, Callout, Card, CardHeader, cx, EmptyState, PageHeader, Segmented } from "../ui/primitives";
import { BankDepositsCard, useDepositExports } from "./bank-deposits";
import { donationCsvRows, Loaded, useExport, useLookups } from "./common";

export function FinancesView() {
  return <Loaded>{(data) => <Finances data={data} />}</Loaded>;
}

function Finances({ data }: { data: DemoDataset }) {
  const { range, rangePreset, feeModel, setFeeModel, toast } = usePortal();
  const lookups = useLookups(data);
  const exportCsv = useExport();

  const f = useMemo(() => financeSummary(data, range), [data, range]);
  const pending = useMemo(() => pendingSettlement(data), [data]);
  const payouts = useMemo(() => data.payouts.filter((p) => inRange(p.payoutDate, range)), [data, range]);
  const refunds = useMemo(() => data.donations.filter((d) => { const at = reversedAt(d); return !!at && inRange(localDay(at), range); }).sort((a, b) => (reversedAt(a)! < reversedAt(b)! ? 1 : -1)), [data, range]);
  const statement = useMemo(
    () =>
      monthsIn(range).map((key) => {
        const from = `${key}-01` < range.from ? range.from : `${key}-01`;
        const to = `${key}-31` > range.to ? range.to : `${key}-31`;
        const s = financeSummary(data, { from, to });
        return { key, ...s };
      }),
    [data, range],
  );
  const reconciled = f.paidOutCents + f.inTransitCents + f.awaitingCents === f.grossCents && f.grossCents - f.refundsCents - f.chargebacksCents - f.processingFeesCents - f.platformFeesCents === f.netCents;

  // This week's batch (Monday to Sunday) is sent next Monday and arrives that Thursday.
  const daysSinceMonday = (weekday(DEMO_TODAY) + 6) % 7;
  const nextArrival = addDays(DEMO_TODAY, 10 - daysSinceMonday);

  const exportReport = () =>
    exportCsv(
      "financial-report",
      ["Month (by donation date)", "Gross donations (R)", "Refunds (R)", "Chargebacks (R)", "Processing fees (R)", "Platform fee (R)", "Net (R)", "Paid out (R)", "On its way (R)", "Not paid out yet (R)"],
      statement.map((m) => [showMonth(m.key), centsToPlain(m.grossCents), centsToPlain(m.refundsCents), centsToPlain(m.chargebacksCents), centsToPlain(m.processingFeesCents), centsToPlain(m.platformFeesCents), centsToPlain(m.netCents), centsToPlain(m.paidOutCents), centsToPlain(m.inTransitCents), centsToPlain(m.awaitingCents)]),
    );
  const depositExports = useDepositExports(data, payouts);

  return (
    <div className="gz-fade-in space-y-6">
      <PageHeader
        title="Finances and payouts"
        subtitle="What was donated, what came off it, and when it reached your bank account."
        actions={
          <>
            <DateRangePicker />
            <Button variant="secondary" icon="download" onClick={exportReport}>
              Financial report
            </Button>
          </>
        }
      />

      <Callout tone="warning" title="Open decision: processing fees">
        <p>The real processing rate is not set and who pays it (the donor, Givezy or the charity) is not decided. The demo uses a placeholder rate. Switch to see both designs:</p>
        <div className="mt-2">
          <Segmented
            label="Who pays the processing fee (demo switch)"
            size="sm"
            value={feeModel}
            onChange={(v) => {
              setFeeModel(v);
              toast({ tone: "info", title: v === "charity" ? "Fees taken off donations" : "Charity receives the full donation", body: "Every screen now uses this setting." });
            }}
            options={[
              { value: "charity", label: "Taken off each donation" },
              { value: "not_charity", label: "Not paid by the charity" },
            ]}
          />
        </div>
      </Callout>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Gross donations" icon="donations" value={rand(f.grossCents)} note="Paid, including later refunded or charged back" />
        <MetricCard label="Fees" icon="percent" value={rand(f.processingFeesCents + f.platformFeesCents)} note={`Processing ${rand(f.processingFeesCents)} · Givezy platform fee R0`} />
        <MetricCard label="Refunds and chargebacks" icon="undo" value={rand(f.refundsCents + f.chargebacksCents)} note={`Refunds ${rand(f.refundsCents)} · chargebacks ${rand(f.chargebacksCents)}`} />
        <MetricCard highlight label="Net donations" icon="wallet" value={rand(f.netCents)} note="What your charity keeps" />
      </div>

      <Card>
        <CardHeader title="Three dates, three meanings" subtitle="Figures on this page use the donation date unless a column says otherwise." />
        <div className="grid gap-3 md:grid-cols-3">
          <DateKind icon="donations" title="Donation date" body="When the donor gave. Used for totals, campaigns, s18A tax years and this page's figures." />
          <DateKind icon="check" title="Settlement date" body="When the payment provider confirmed the money for your account, usually the next business day." />
          <DateKind icon="bank" title="Payout date" body="When the money lands in your bank account. Payouts group a week of settlements." />
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Reconciliation"
            subtitle={`Donations made ${RANGE_LABELS[rangePreset].toLowerCase()}`}
            action={reconciled ? <Badge tone="success">Balances</Badge> : <Badge tone="danger">Does not balance</Badge>}
          />
          <table className="w-full text-sm">
            <caption className="sr-only">Reconciliation from gross donations to net</caption>
            <tbody>
              <Line label="Gross donations" value={f.grossCents} />
              <Line label="Refunds" value={-f.refundsCents} />
              <Line label="Chargebacks" value={-f.chargebacksCents} note="Payments the card holder's bank reversed" />
              <Line label="Processing fees (placeholder rate)" value={-f.processingFeesCents} />
              <Line label="Givezy platform fee" value={-f.platformFeesCents} note="Givezy charges no platform fee" />
              <Line label="Net donations" value={f.netCents} total />
            </tbody>
          </table>
          <h3 className="mb-2 mt-6 text-base">Where the gross donations are now</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <Where tone="success" label="Paid out to your bank" value={f.paidOutCents} />
            <Where tone="info" label="On its way" value={f.inTransitCents} />
            <Where tone="warning" label="Settled or settling, not paid out yet" value={f.awaitingCents} />
          </div>
        </Card>

        <Card className="bg-gz-blue-soft/50">
          <CardHeader title="Next payout" subtitle={`Expected in your bank about ${showDay(nextArrival)}`} />
          <p className="text-3xl font-semibold text-gz-blue" style={{ fontFamily: "var(--font-fredoka)" }}>
            {rand(pending.netCents)}
          </p>
          <p className="text-xs text-gz-muted">so far, and growing until Sunday</p>
          <dl className="mt-4 space-y-2 text-sm">
            <Pair k={`Settled this week (${count(pending.settledCount)})`} v={rand(pending.settledCents)} />
            <Pair k={`Paid, not settled yet (${count(pending.notSettledCount)})`} v={rand(pending.notSettledCents)} />
            <Pair k="Fees" v={`− ${rand(pending.feesCents)}`} />
            <Pair k="Refunds and chargebacks this week" v={`− ${rand(pending.refundsCents)}`} />
          </dl>
          <div className="mt-4 rounded-2xl bg-gz-surface p-3 text-xs text-gz-muted">
            <p className="flex items-center gap-1.5 font-semibold text-gz-ink">
              <Icon name="bank" size={14} /> {data.charity.bankName} ending {data.charity.bankLast4}
            </p>
            <p className="mt-1">{DEMO_PAYOUT_SCHEDULE}.</p>
          </div>
        </Card>
      </div>

      <BankDepositsCard data={data} payouts={payouts} periodLabel={RANGE_LABELS[rangePreset].toLowerCase()} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Monthly statement" subtitle="By donation date" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px] text-sm">
              <thead>
                <tr className="text-left text-xs text-gz-muted">
                  <th className="pb-2 font-semibold">Month</th>
                  <th className="pb-2 text-right font-semibold">Gross</th>
                  <th className="pb-2 text-right font-semibold">Reversed</th>
                  <th className="pb-2 text-right font-semibold">Fees</th>
                  <th className="pb-2 text-right font-semibold">Net</th>
                </tr>
              </thead>
              <tbody>
                {statement.map((m) => (
                  <tr key={m.key} className="border-t border-gz-hairline/70">
                    <td className="py-2">{showMonth(m.key)}</td>
                    <td className="py-2 text-right">{rand(m.grossCents)}</td>
                    <td className="py-2 text-right text-gz-muted">{m.refundsCents + m.chargebacksCents ? `− ${rand(m.refundsCents + m.chargebacksCents)}` : "R0"}</td>
                    <td className="py-2 text-right text-gz-muted">{m.processingFeesCents ? `− ${rand(m.processingFeesCents)}` : "R0"}</td>
                    <td className="py-2 text-right font-semibold">{rand(m.netCents)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gz-ink/20 font-semibold">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right">{rand(f.grossCents)}</td>
                  <td className="py-2 text-right">{f.refundsCents + f.chargebacksCents ? `− ${rand(f.refundsCents + f.chargebacksCents)}` : "R0"}</td>
                  <td className="py-2 text-right">{f.processingFeesCents ? `− ${rand(f.processingFeesCents)}` : "R0"}</td>
                  <td className="py-2 text-right text-gz-blue">{rand(f.netCents)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Refunds and chargebacks" subtitle="By the date the money was taken back" />
          {refunds.length ? (
            <ul className="divide-y divide-gz-hairline">
              {refunds.slice(0, 8).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{donorName(lookups.donor.get(d.donorId))}</span>
                    <span className="block text-xs text-gz-muted">
                      Donated {date(d.donatedAt)} · {d.status === "charged_back" ? "charged back" : "refunded"} {date(reversedAt(d)!)}
                    </span>
                  </span>
                  <span className="font-semibold">− {rand(d.amountCents)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="undo" title="No refunds or chargebacks in this period" />
          )}
          {refunds.length > 8 && <p className="mt-2 text-xs text-gz-muted">And {count(refunds.length - 8)} more in the financial report.</p>}
          <p className="mt-3 text-xs text-gz-muted">A chargeback is started by the card holder&apos;s bank, not by you or Givezy. Who can refund, and whether the fee comes back, are open decisions. In the demo only Givezy refunds, and the fee is not returned.</p>
        </Card>
      </div>

      <Card>
        <CardHeader title="Exports for your bookkeeper" subtitle={`Plain CSV files that open in Excel or Google Sheets and import into any accounting package. Deposits ${RANGE_LABELS[rangePreset].toLowerCase()}, by the date they reached your bank. Made in your browser from demo data.`} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ExportTile icon="bank" title="Bank deposits" body="One row per deposit, to tick off against your bank statement" onClick={depositExports.deposits} />
          <ExportTile icon="table" title="Deposit detail" body="Every donation, refund and chargeback behind each deposit, adding up to it" onClick={depositExports.detail} />
          <ExportTile icon="flag" title="Deposits by campaign" body="Each deposit split by campaign, for your journal entries" onClick={depositExports.byFund} />
          <ExportTile icon="chart" title="Financial report" body="Monthly gross, refunds, fees and net" onClick={exportReport} />
          <ExportTile
            icon="donations"
            title="Donations with fees"
            body="Each donation with fee, net, settlement and payout"
            onClick={() => {
              const { header, body } = donationCsvRows(
                data.donations.filter((d) => visibleToCharity(d) && inRange(dayOf(d), range)),
                lookups,
              );
              exportCsv("donations-with-fees", header, body);
            }}
          />
        </div>
      </Card>

    </div>
  );
}

function DateKind({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-gz-hairline bg-gz-cream p-4">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-gz-surface text-gz-blue shadow-sm">
        <Icon name={icon} size={18} />
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-sm text-gz-muted">{body}</span>
      </span>
    </div>
  );
}

function Line({ label, value, total, note }: { label: string; value: number; total?: boolean; note?: string }) {
  return (
    <tr className={cx(total ? "border-t-2 border-gz-ink/20" : "border-t border-gz-hairline/70 first:border-t-0")}>
      <th scope="row" className={cx("py-2.5 text-left", total ? "font-semibold" : "font-normal text-gz-muted")}>
        {label}
        {note && <span className="block text-xs">{note}</span>}
      </th>
      <td className={cx("py-2.5 text-right", total ? "text-lg font-semibold text-gz-blue" : "font-semibold")}>{value < 0 ? `− ${rand(-value)}` : rand(value)}</td>
    </tr>
  );
}

function Where({ tone, label, value }: { tone: "success" | "info" | "warning"; label: string; value: number }) {
  const t = { success: "bg-gz-success-soft text-gz-success", info: "bg-gz-blue-soft text-gz-blue", warning: "bg-gz-warning-soft text-gz-warning" }[tone];
  return (
    <div className={cx("rounded-2xl p-3", t)}>
      <p className="text-lg font-bold">{rand(value)}</p>
      <p className="text-xs font-medium">{label}</p>
    </div>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-gz-muted">{k}</dt>
      <dd className="whitespace-nowrap font-semibold">{v}</dd>
    </div>
  );
}

function ExportTile({ icon, title, body, onClick }: { icon: IconName; title: string; body: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-start gap-3 rounded-2xl border border-gz-hairline bg-gz-cream p-4 text-left hover:border-gz-blue/40 hover:bg-gz-blue-soft/30">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-gz-surface text-gz-blue shadow-sm">
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {title} <Icon name="download" size={14} className="text-gz-muted" />
        </span>
        <span className="mt-0.5 block text-xs text-gz-muted">{body}</span>
      </span>
    </button>
  );
}
