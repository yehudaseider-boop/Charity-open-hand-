"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { receiptConfig } from "@/config/receipts";
import { taxYearLabel, taxYearRange } from "@/lib/dates";
import { centsToPlain } from "@/lib/csv";
import { showDay } from "../data/day";
import { currentTaxYear, donorName, s18aReceipts, s18aSummary, type S18aReceipt, type S18aStatus } from "../data/selectors";
import type { DemoDataset } from "../data/types";
import { usePortal } from "../store";
import { count, date, permille, rand, randWhole } from "../ui/format";
import { SearchInput } from "../ui/form";
import { Icon } from "../ui/icons";
import { MetricCard } from "../ui/metric";
import { Drawer, Modal } from "../ui/overlay";
import { Avatar, Badge, Button, ButtonLink, Callout, Card, CardHeader, cx, DetailList, EmptyState, PageHeader, Progress, Segmented } from "../ui/primitives";
import { BASE } from "../ui/shell";
import { DataTable } from "../ui/table";
import { campaignName, Loaded, useExport, useLookups } from "./common";

export function ReceiptsView() {
  return <Loaded>{(data) => (data.charity.s18a ? <Receipts data={data} /> : <NotApproved data={data} />)}</Loaded>;
}

const STATUS: Record<S18aStatus, { label: string; tone: "success" | "info" | "warning"; icon?: "clock" | "alert" }> = {
  issued: { label: "Issued", tone: "success" },
  after_year_end: { label: "After year end", tone: "info", icon: "clock" },
  needs_details: { label: "Needs details", tone: "warning", icon: "alert" },
};

export function ReceiptStatusBadge({ status }: { status: S18aStatus }) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {s.label}
    </Badge>
  );
}

function NotApproved({ data }: { data: DemoDataset }) {
  return (
    <div className="gz-fade-in">
      <PageHeader title="s18A receipts" subtitle="Tax receipts that let donors claim their donation from SARS." />
      <Card>
        <EmptyState
          icon="receipt"
          title={`${data.charity.shortName} is not approved for s18A yet`}
          body="Donors cannot ask for a tax receipt until your charity has a PBO number, s18A approval from SARS and a signed receipting mandate. Once the Givezy team confirms them, this page starts to fill."
          action={
            <ButtonLink href={`${BASE}/settings?tab=verification`} size="sm">
              See verification steps
            </ButtonLink>
          }
        />
      </Card>
    </div>
  );
}

function Receipts({ data }: { data: DemoDataset }) {
  const { toast } = usePortal();
  const lookups = useLookups(data);
  const exportCsv = useExport();
  const thisYear = currentTaxYear();
  const [taxYear, setTaxYear] = useState(thisYear);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | S18aStatus>("all");
  const [open, setOpen] = useState<S18aReceipt | null>(null);
  const [asking, setAsking] = useState<string | null>(null);

  const summary = useMemo(() => s18aSummary(data, taxYear), [data, taxYear]);
  const receipts = useMemo(() => s18aReceipts(data, taxYear), [data, taxYear]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return receipts.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      const donor = lookups.donor.get(r.donorId);
      return !needle || `${donorName(donor)} ${donor?.email ?? ""} ${r.number ?? ""}`.toLowerCase().includes(needle);
    });
  }, [receipts, q, status, lookups]);
  const needDetails = receipts.filter((r) => r.status === "needs_details");

  return (
    <div className="gz-fade-in space-y-6">
      <PageHeader
        title="s18A receipts"
        subtitle="One receipt for each donor, for each tax year, covering the donations they asked a receipt for. Issued after the tax year closes. The amount is the donation only, never a processing fee."
        actions={
          <>
            <Segmented
              label="Tax year"
              value={String(taxYear)}
              onChange={(v) => setTaxYear(Number(v))}
              options={[
                { value: String(thisYear), label: `Tax year ${thisYear}` },
                { value: String(thisYear - 1), label: `Tax year ${thisYear - 1}` },
              ]}
            />
            <Button
              variant="secondary"
              icon="download"
              onClick={() =>
                exportCsv(
                  `s18a-receipts-${taxYear}`,
                  ["Receipt number", "Tax year", "Donor", "Donor email", "Donations", "Total (R)", "Status", "Issued on"],
                  rows.map((r) => {
                    const donor = lookups.donor.get(r.donorId);
                    return [r.number ?? "", r.taxYear, donorName(donor), donor?.email ?? "", r.donationIds.length, centsToPlain(r.totalCents), STATUS[r.status].label, r.issuedOn ? showDay(r.issuedOn) : ""];
                  }),
                )
              }
            >
              Export CSV
            </Button>
          </>
        }
      />

      <Callout tone="warning" title="Draft receipt wording">
        The wording on the receipt is a draft until our attorney confirms it. Real receipts are not issued until then, so everything below is a preview.
      </Callout>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard highlight label="Asked for a receipt" icon="receipt" value={randWhole(summary.totalCents)} note={`${count(summary.donationCount)} donations from ${count(summary.donors)} donors`} />
        <MetricCard label={summary.closed ? "Receipts issued" : "Issued after year end"} icon="check" value={count(summary.closed ? summary.issued : summary.afterYearEnd)} note={summary.closed ? "Ready for donors to download" : `On or after ${showDay(summary.end)}`} />
        <MetricCard label="Missing donor details" icon="alert" value={count(summary.needsDetails)} note="A receipt cannot be issued without them" />
        <MetricCard label={summary.closed ? "Year closed" : "Days to year end"} icon="calendar" value={summary.closed ? showDay(summary.end) : count(summary.daysToYearEnd)} note={taxYearLabel(summary.taxYear)} />
      </div>

      {!summary.closed && (
        <Card className="bg-gz-lilac-soft">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg">Tax year {summary.taxYear} is {permille(summary.yearElapsedPermille)} through</h2>
            <p className="text-sm text-gz-ink/80">Closes {showDay(summary.end)}</p>
          </div>
          <Progress permille={summary.yearElapsedPermille} className="mt-3" label="Tax year elapsed" />
          <p className="mt-3 text-sm text-gz-ink/80">
            Donations given up to {showDay(summary.end)} count towards this year&apos;s receipts. A reminder to donors before the year ends is a good moment to ask for more.
          </p>
        </Card>
      )}

      {needDetails.length > 0 && (
        <Card>
          <CardHeader title={`${count(needDetails.length)} ${needDetails.length === 1 ? "donor needs" : "donors need"} to complete their details`} subtitle="They asked for a receipt but their name, address or ID or tax number is incomplete." />
          <ul className="divide-y divide-gz-hairline">
            {needDetails.slice(0, 5).map((r) => {
              const donor = lookups.donor.get(r.donorId);
              return (
                <li key={r.donorId} className="flex flex-wrap items-center gap-3 py-2.5">
                  <Avatar name={donorName(donor)} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{donorName(donor)}</span>
                    <span className="block text-xs text-gz-muted">{donor?.email} · {rand(r.totalCents)} waiting</span>
                  </span>
                  <Button size="sm" variant="soft" icon="mail" onClick={() => setAsking(r.donorId)}>
                    Draft a request
                  </Button>
                </li>
              );
            })}
          </ul>
          {needDetails.length > 5 && <p className="mt-2 text-xs text-gz-muted">And {count(needDetails.length - 5)} more. Filter the list below by Needs details.</p>}
        </Card>
      )}

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search donor, email or receipt number" label="Search receipts" />
          <div className="flex gap-1 overflow-x-auto" role="radiogroup" aria-label="Receipt status">
            {(["all", "issued", "after_year_end", "needs_details"] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => setStatus(s)} className={cx("min-h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold", status === s ? "border-gz-blue bg-gz-blue text-white" : "border-gz-hairline bg-gz-surface text-gz-ink hover:border-gz-blue/40")}>
                {s === "all" ? "All" : STATUS[s].label}
              </button>
            ))}
          </div>
        </div>
        <DataTable
          caption={`s18A receipts, tax year ${taxYear}`}
          rows={rows}
          rowKey={(r) => r.donorId}
          onRowClick={setOpen}
          rowLabel={(r) => `Open receipt for ${donorName(lookups.donor.get(r.donorId))}`}
          initialSort={{ key: "total", dir: "desc" }}
          pageSize={12}
          columns={[
            { key: "donor", header: "Donor", sort: (r) => donorName(lookups.donor.get(r.donorId)), cell: (r) => <span className="flex items-center gap-2.5"><Avatar name={donorName(lookups.donor.get(r.donorId))} size={32} /><span className="font-semibold">{donorName(lookups.donor.get(r.donorId))}</span></span> },
            { key: "number", header: "Receipt number", sort: (r) => r.number ?? "", cell: (r) => r.number ?? <span className="text-gz-muted">Not issued</span> },
            { key: "count", header: "Donations", align: "right", sort: (r) => r.donationIds.length, cell: (r) => count(r.donationIds.length), wide: true },
            { key: "total", header: "Total", align: "right", sort: (r) => r.totalCents, cell: (r) => <span className="font-semibold">{rand(r.totalCents)}</span> },
            { key: "status", header: "Status", sort: (r) => r.status, cell: (r) => <ReceiptStatusBadge status={r.status} /> },
            { key: "issued", header: "Issued on", sort: (r) => r.issuedOn ?? "", cell: (r) => (r.issuedOn ? showDay(r.issuedOn) : <span className="text-gz-muted">{r.status === "after_year_end" ? `After ${showDay(summary.end)}` : "Waiting"}</span>), wide: true },
          ]}
          mobile={(r) => (
            <span className="flex items-center gap-3">
              <Avatar name={donorName(lookups.donor.get(r.donorId))} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{donorName(lookups.donor.get(r.donorId))}</span>
                <span className="block text-xs text-gz-muted">{r.number ?? "Not issued"} · {count(r.donationIds.length)} donations</span>
                <span className="mt-1 block"><ReceiptStatusBadge status={r.status} /></span>
              </span>
              <span className="font-semibold">{rand(r.totalCents)}</span>
            </span>
          )}
          empty={<EmptyState icon="receipt" title="No receipts match" body={receipts.length ? "Try another search or status." : `Nobody asked for a receipt in tax year ${taxYear} in the demo data.`} />}
        />
        {taxYear < thisYear && <p className="mt-3 text-xs text-gz-muted">Demo data starts on 15/04/2025, so this year is shorter than a full tax year.</p>}
      </Card>

      {open && <ReceiptDrawer receipt={open} data={data} onClose={() => setOpen(null)} />}
      <RequestDetailsModal donorId={asking} data={data} onClose={() => setAsking(null)} onCopied={() => toast({ tone: "success", title: "Message copied", body: "Send it from your own email. Nothing was sent." })} />
    </div>
  );
}

function ReceiptDrawer({ receipt, data, onClose }: { receipt: S18aReceipt; data: DemoDataset; onClose: () => void }) {
  const { toast } = usePortal();
  const lookups = useLookups(data);
  const donor = lookups.donor.get(receipt.donorId);
  const rows = data.donations.filter((d) => receipt.donationIds.includes(d.id));
  const range = taxYearRange(receipt.taxYear);
  const period = `${showDay(range.start)} to ${showDay(range.end)}`;
  const statement = receiptConfig.wording.statement.replace("{charity}", data.charity.name).replace("{period}", period);
  return (
    <Drawer
      open
      onClose={onClose}
      title={receipt.number ?? "Receipt not issued"}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-2">
          <ReceiptStatusBadge status={receipt.status} />
          {donorName(donor)}
        </span>
      }
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            icon="download"
            disabled={receipt.status !== "issued"}
            onClick={() => toast({ tone: "info", title: "Demo only: no PDF made", body: "In the live portal this opens a 60-second signed link and the download is logged." })}
          >
            Download PDF
          </Button>
          <Link href={`${BASE}/donors?donor=${encodeURIComponent(receipt.donorId)}`} className="inline-flex min-h-9 items-center rounded-full px-3.5 text-sm font-semibold text-gz-blue hover:bg-gz-blue-soft/60">
            View donor
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        {receipt.status === "needs_details" && <Callout tone="warning" title="Cannot be issued yet">The donor&apos;s details are incomplete. Ask them to complete them and the receipt is issued with the others.</Callout>}
        {receipt.status === "after_year_end" && <Callout tone="info" title="Issued after the tax year closes">This year ends on {showDay(range.end)}. The total can still grow until then.</Callout>}
        <div className="rounded-[22px] border border-gz-hairline bg-gz-surface p-5 shadow-gz">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-gz-muted">{receiptConfig.wording.title}</p>
              <p className="mt-1 text-lg font-semibold text-gz-blue" style={{ fontFamily: "var(--font-fredoka)" }}>{data.charity.name}</p>
              <p className="text-xs text-gz-muted">NPO {data.charity.npoNumber} · PBO {data.charity.pboNumber}</p>
            </div>
            <Badge tone="warning" icon={false}>DRAFT</Badge>
          </div>
          <dl className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-gz-muted">Donor</dt><dd className="font-medium">{donorName(donor)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-gz-muted">ID or tax number</dt><dd className="font-medium">•••• (last 4 digits only)</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-gz-muted">Receipt number</dt><dd className="font-medium">{receipt.number ?? "Not issued"}</dd></div>
          </dl>
          <table className="mt-4 w-full text-sm">
            <caption className="sr-only">Donations on this receipt</caption>
            <thead><tr className="text-left text-xs text-gz-muted"><th className="pb-1.5 font-semibold">Date</th><th className="pb-1.5 font-semibold">For</th><th className="pb-1.5 text-right font-semibold">Amount</th></tr></thead>
            <tbody>
              {rows.slice(0, 12).map((d) => (
                <tr key={d.id} className="border-t border-gz-hairline/70">
                  <td className="py-1.5 whitespace-nowrap">{date(d.donatedAt)}</td>
                  <td className="py-1.5 pr-2 text-gz-muted">{campaignName(d.campaignId, lookups.campaign)}</td>
                  <td className="py-1.5 text-right whitespace-nowrap">{rand(d.amountCents)}</td>
                </tr>
              ))}
              {rows.length > 12 && <tr className="border-t border-gz-hairline/70"><td colSpan={3} className="py-1.5 text-xs text-gz-muted">And {count(rows.length - 12)} more donations</td></tr>}
              <tr className="border-t-2 border-gz-ink/20 font-semibold"><td className="py-2" colSpan={2}>Total</td><td className="py-2 text-right text-gz-blue whitespace-nowrap">{rand(receipt.totalCents)}</td></tr>
            </tbody>
          </table>
          <p className="mt-4 text-xs text-gz-muted">{statement}</p>
        </div>
        <DetailList items={[["Donations", count(rows.length)], ["Tax year", taxYearLabel(receipt.taxYear)], ["Issued on", receipt.issuedOn ? showDay(receipt.issuedOn) : "Not yet"]]} />
        <p className="flex gap-2 text-xs text-gz-muted">
          <Icon name="info" size={14} className="mt-0.5 shrink-0" />
          Only the Givezy team can void or re-issue a receipt. Voided receipts are kept, with a reason.
        </p>
      </div>
    </Drawer>
  );
}

function RequestDetailsModal({ donorId, data, onClose, onCopied }: { donorId: string | null; data: DemoDataset; onClose: () => void; onCopied: () => void }) {
  const donor = data.donors.find((d) => d.id === donorId);
  const sender = data.team.find((m) => m.role === "owner")?.name ?? data.charity.shortName;
  const body = donor
    ? `Dear ${donor.firstName},\n\nThank you for asking for an s18A receipt for your donations to ${data.charity.name}. Before we can issue it, SARS requires your full name, your address and your ID or tax number.\n\nPlease reply with the missing details, or update them the next time you give. We keep them private and print only the last 4 digits of your number on the receipt.\n\nWith thanks,\n${sender}\n${data.charity.name}`
    : "";
  const subject = `Your s18A receipt from ${data.charity.shortName}`;
  return (
    <Modal
      open={!!donor}
      onClose={onClose}
      title="Request missing details"
      description="A draft for you to send from your own email. Givezy sends nothing."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button
            variant="secondary"
            icon="copy"
            onClick={() => {
              navigator.clipboard?.writeText(body).catch(() => undefined);
              onCopied();
            }}
          >
            Copy message
          </Button>
          {donor && (
            <a href={`mailto:${donor.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gz-blue px-5 text-[15px] font-semibold text-white hover:bg-gz-blue-hover">
              <Icon name="mail" size={18} /> Open in email
            </a>
          )}
        </>
      }
    >
      {donor && (
        <div className="space-y-3 text-sm">
          <p><span className="text-gz-muted">To:</span> {donor.email}</p>
          <p><span className="text-gz-muted">Subject:</span> {subject}</p>
          <pre className="whitespace-pre-wrap rounded-2xl border border-gz-hairline bg-gz-cream p-4 font-sans text-[14px] leading-relaxed">{body}</pre>
        </div>
      )}
    </Modal>
  );
}

