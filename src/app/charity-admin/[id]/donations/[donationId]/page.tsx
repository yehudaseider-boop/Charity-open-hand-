import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/badge";
import { Card } from "@/components/card";
import { requireViewer } from "@/lib/auth";
import { addressLine, donationStatus, donorName } from "@/lib/charity/dashboard";
import { DONATION_FIELDS, type DonationRow } from "@/lib/charity/dashboard-queries";
import { loadCharityForManager } from "@/lib/charity/queries";
import { formatDateTime } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { donationReference } from "@/lib/donations/reference";
import { createClient } from "@/lib/supabase/server";

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

  // The receipt this donation is on, if one has been issued (a charity admin can read its charity's receipts).
  const { data: links } = await supabase
    .from("s18a_receipt_donations")
    .select("s18a_receipts(id, status, pdf_path, reference:details->>receipt_reference)")
    .eq("donation_id", donationId);
  type Receipt = { id: string; status: string; pdf_path: string | null; reference: string };
  const receipts = (links ?? []).map((l) => (Array.isArray(l.s18a_receipts) ? l.s18a_receipts[0] : l.s18a_receipts) as unknown as Receipt | null).filter((r): r is Receipt => r !== null);

  return (
    <div className="space-y-4">
      <Link href={`/charity-admin/${id}/donations`} className="text-sm text-muted">← Donations</Link>
      <div>
        <p className="text-2xl font-semibold">{formatRand(d.amount_cents)}</p>
        <div className="mt-1"><Badge tone={s.tone}>{s.label}</Badge></div>
      </div>

      <Card title="Donation">
        <dl>
          <Row label="Started">{formatDateTime(d.created_at)}</Row>
          {d.paid_at ? <Row label="Paid">{formatDateTime(d.paid_at)}</Row> : null}
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
          {d.email ? <Row label="Email"><a href={`mailto:${d.email}`} className="text-brand underline">{d.email}</a></Row> : null}
          {d.phone ? <Row label="Phone">{d.phone}</Row> : null}
          {addressLine(d) ? <Row label="Address">{addressLine(d)}</Row> : null}
        </dl>
      </Card>

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
                {r.status === "void" ? <Badge tone="warning">Withdrawn</Badge> : r.pdf_path ? <Link href={`/receipts/${r.id}`} prefetch={false} className="text-brand underline">Download PDF</Link> : <span className="text-muted">PDF on its way</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
