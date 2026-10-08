import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { Card, Notice } from "@/components/card";
import { donorName, loadDonation, requireCharityDashboard } from "@/lib/charity/dashboard";
import { donationStatuses } from "@/lib/charity/donation-filters";
import { formatDateTime } from "@/lib/dates";
import { formatRand } from "@/lib/money";

export const metadata: Metadata = { title: "Donation" };

const donorTypes = { individual: "Individual", company: "Company", trust: "Trust" } as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
      <dt className="text-sm text-muted sm:w-44 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

export default async function DonationPage({ params }: PageProps<"/charity-admin/[id]/donations/[donationId]">) {
  const { id, donationId } = await params;
  const list = `/charity-admin/${id}/donations`;
  await requireCharityDashboard(id, `${list}/${donationId}`);
  const d = await loadDonation(id, donationId);
  const status = donationStatuses[d.status];
  const org = d.donor_type === "company" || d.donor_type === "trust";
  const address = [d.address_line1, d.address_line2, d.suburb, d.city, d.postal_code].map(str).filter(Boolean).join(", ");

  return (
    <div className="space-y-4">
      <div>
        <Link href={list} className="text-sm text-muted">← Donations</Link>
        <h1 className="mt-1 text-xl font-semibold">{formatRand(d.amount_cents)} from {donorName(d)}</h1>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone={status.tone}>{status.label}</Badge>
          {d.wants_18a ? <Badge tone="brand">18A receipt requested</Badge> : null}
          {d.is_anonymous ? <Badge>Anonymous</Badge> : null}
          {d.recurring_id ? <Badge>Monthly</Badge> : null}
        </div>
      </div>

      {d.status === "refunded" ? <Notice tone="danger">Refunded on {formatDateTime(String(d.refunded_at))}. This donation was returned to the donor and is not counted in your totals.</Notice> : null}
      {d.status === "charged_back" ? <Notice tone="danger">Charged back on {formatDateTime(String(d.charged_back_at))}. The donor&apos;s bank reversed this payment, so it is not counted in your totals.</Notice> : null}
      {d.status === "pending" ? <Notice tone="warning">The donor started paying and we haven&apos;t had confirmation yet. Nothing to do on your side.</Notice> : null}
      {d.status === "failed" ? <Notice>This payment didn&apos;t go through. Nothing was charged.</Notice> : null}
      {d.is_anonymous ? (
        <Notice>
          This donor chose to give anonymously: their name doesn&apos;t appear on public pages, campaign lists or live totals.
          You still see their details, because you need them to record the donation{d.wants_18a ? " and issue their 18A receipt" : ""}.
        </Notice>
      ) : null}

      <Card title="Donation">
        <dl className="divide-y divide-border">
          <Row label="Donation">{formatRand(d.amount_cents)}</Row>
          <Row label="Processing fee paid by donor">{formatRand(Number(d.total_charged_cents) - Number(d.amount_cents))}</Row>
          <Row label="Total the donor paid">{formatRand(Number(d.total_charged_cents))}</Row>
          <Row label="Started">{formatDateTime(String(d.created_at))}</Row>
          <Row label="Paid">{d.paid_at ? formatDateTime(d.paid_at) : null}</Row>
          <Row label="Tax year">{d.tax_year ? String(d.tax_year) : null}</Row>
          <Row label="Campaign">{d.campaign_title}</Row>
          <Row label={str(d.campaign_answer) ? "Answer to campaign question" : ""}>{str(d.campaign_answer)}</Row>
          <Row label="Message to you">{str(d.message) ? <span className="whitespace-pre-wrap">{str(d.message)}</span> : null}</Row>
        </dl>
      </Card>

      <Card title="Donor details as given">
        <dl className="divide-y divide-border">
          <Row label="Giving as">{d.donor_type ? donorTypes[d.donor_type] : null}</Row>
          <Row label={org ? "Organisation" : "Name"}>{donorName(d)}</Row>
          <Row label="Registration number">{org ? str(d.registration_number) : null}</Row>
          <Row label="Contact person">{org ? str(d.contact_person) : null}</Row>
          <Row label="Email">{d.email ? <a href={`mailto:${d.email}`} className="text-brand underline">{d.email}</a> : null}</Row>
          <Row label="Phone">{str(d.phone)}</Row>
          <Row label="ID number">{str(d.id_number_last4) ? `Ending ${d.id_number_last4}` : null}</Row>
          <Row label="Tax number">{str(d.tax_reference_last4) ? `Ending ${d.tax_reference_last4}` : null}</Row>
          <Row label="Address">{address}</Row>
        </dl>
        <p className="mt-3 text-xs text-muted">
          These are the details the donor typed for this donation. ID and tax numbers are stored encrypted; only the last 4 digits are shown.
        </p>
      </Card>
    </div>
  );
}
