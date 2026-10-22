import { HebrewAware } from "@/components/hebrew-aware";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/badge";
import { Card } from "@/components/card";
import { requireViewer } from "@/lib/auth";
import { addressLine, donationStatus, donorName, shownEmail } from "@/lib/charity/dashboard";
import { DONATION_FIELDS, type DonationRow } from "@/lib/charity/dashboard-queries";
import { loadCharityForManager } from "@/lib/charity/queries";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { donationReference } from "@/lib/donations/reference";
import { createClient } from "@/lib/supabase/server";
import { dedicationFrom, dedicationLine } from "@/lib/donations/dedication";
import { cameInBy } from "@/lib/charity/recorded-gifts";
import { giftSourceLabel } from "@/lib/donations/source";
import { removeRecordedGifts } from "../record-actions";
import { RemoveImportForm } from "../record-forms";
import { BackLink } from "@/components/back-link";

export const metadata: Metadata = { title: "Donation" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right break-words">{children}</dd>
    </div>
  );
}

export default async function DonationPage({ params }: PageProps<"/charity-admin/[id]/donations/[donationId]">) {
  const { id, donationId } = await params;
  await requireViewer(`/charity-admin/${id}/donations/${donationId}`);
  await loadCharityForManager(id);
  if (!/^[0-9a-f-]{36}$/i.test(donationId)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("charity_donations").select(DONATION_FIELDS).eq("charity_id", id).eq("id", donationId).maybeSingle();
  if (!data) notFound();
  const d = data as unknown as DonationRow;
  const s = donationStatus[d.status];

  // The receipt this donation is on, if one has been issued (a narrow view: no donor ID or tax digits).
  const { data: links } = await supabase.from("charity_receipt_donations").select("receipt_id, status, reference").eq("donation_id", donationId);
  const campaign = d.campaign_id ? (await supabase.from("campaigns").select("title").eq("id", d.campaign_id).eq("charity_id", id).maybeSingle()).data : null;
  const receipts = (links ?? []).map((l) => ({ id: l.receipt_id as string, status: l.status as string, reference: l.reference as string }));

  return (
    <div className="space-y-4">
      <BackLink href={`/charity-admin/${id}/donations`}>← Donations</BackLink>
      <div>
        <p className="text-2xl font-semibold">{formatRand(d.amount_cents)}</p>
        <div className="mt-1"><Badge tone={s.tone}>{s.label}</Badge></div>
      </div>

      <Card title="Donation" headingLevel={1}>
        <dl>
          {d.recorded_method ? null : <Row label="Started">{formatDateTime(d.created_at)}</Row>}
          {d.paid_at ? <Row label={d.recorded_method ? "Came in" : "Paid"}>{d.recorded_method ? formatDate(d.paid_at) : formatDateTime(d.paid_at)}</Row> : null}
          <Row label="How it came in">{cameInBy(d.recorded_method)}</Row>
          {d.recorded_method ? null : <Row label="Came from">{giftSourceLabel(d.came_from)}</Row>}
          {d.campaign_id ? (
            <Row label="Campaign">
              <Link href={`/charity-admin/${id}/donations?campaign=${d.campaign_id}`} className="text-brand underline">{(campaign?.title as string | undefined) ?? "A campaign"}</Link>
            </Row>
          ) : null}
          {d.external_ref ? <Row label="Your reference">{d.external_ref}</Row> : null}
          {d.refunded_at ? <Row label="Refunded">{formatDateTime(d.refunded_at)}</Row> : null}
          {d.charged_back_at ? <Row label="Charged back">{formatDateTime(d.charged_back_at)}</Row> : null}
          {d.tax_year ? <Row label="Tax year">{d.tax_year}</Row> : null}
          <Row label="s18A receipt requested">{d.wants_18a ? "Yes" : "No"}</Row>
          <Row label="Reference">{donationReference(d.id)}</Row>
        </dl>
      </Card>

      <Card title="Donor">
        <dl>
          <Row label="Name">{donorName(d)}</Row>
          {d.is_anonymous ? <Row label="Anonymous">Not shown on public pages. You see the details because you need them to record the donation.</Row> : null}
          {d.contact_person ? <Row label="Contact person">{d.contact_person}</Row> : null}
          {d.registration_number ? <Row label="Registration number">{d.registration_number}</Row> : null}
          {shownEmail(d.email) ? <Row label="Email"><a href={`mailto:${d.email}`} className="text-brand underline">{d.email}</a></Row> : null}
          {d.phone ? <Row label="Phone">{d.phone}</Row> : null}
          {addressLine(d) ? <Row label="Address">{addressLine(d)}</Row> : null}
        </dl>
      </Card>

      {dedicationFrom(d.dedication_kind, d.dedication_name) ? (
        <Card title="Dedication">
          <p className="text-sm" dir="auto"><HebrewAware text={dedicationLine(dedicationFrom(d.dedication_kind, d.dedication_name)!)} /></p>
        </Card>
      ) : null}

      {d.message ? (
        <Card title="Message from the donor">
          <p className="whitespace-pre-wrap break-words text-sm">{d.message}</p>
        </Card>
      ) : null}

      <Card title="s18A receipt">
        {receipts.length === 0 ? (
          <p className="text-sm text-muted">
            {d.wants_18a ? "Not issued yet. Receipts are issued after the tax year ends." : "The donor did not ask for a receipt."}
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {receipts.map((r) => (
              <li key={r.id}>
                {r.reference}{" "}
                {r.status === "void" ? <Badge tone="warning">Withdrawn</Badge> : <Badge tone="success">Issued</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {d.recorded_method && receipts.length === 0 ? (
        <Card title="A mistake?">
          <p className="mb-3 text-sm text-muted">You recorded this gift, so you can remove it until it is on an s18A receipt. Then record it again with the right details.</p>
          <RemoveImportForm action={removeRecordedGifts.bind(null, id, { donationId: d.id })} gifts={1} />
        </Card>
      ) : null}
    </div>
  );
}
