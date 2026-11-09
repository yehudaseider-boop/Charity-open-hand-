import Link from "next/link";
import { Badge } from "@/components/badge";
import { BackLink } from "@/components/back-link";
import { Card, Notice } from "@/components/card";
import { PageHeader } from "@/components/dash";
import { SupportContact } from "@/components/legal";
import { taxYearLabel } from "@/lib/dates";
import type { FormState } from "@/lib/form";
import { formatRand } from "@/lib/money";
import { STATUS_WORDS, type CertificateStatus } from "@/lib/receipts/review";
import { ApproveCertificateForm, DeclineCertificateForm, EditCertificateForm, ReopenCertificateForm } from "../forms";

type Action = (s: FormState, f: FormData) => Promise<FormState>;
type Status = CertificateStatus;
const WORDS = STATUS_WORDS;
const TONE = { to_check: "warning", approved: "success", edited: "success", declined: "danger" } as const;

export type CertificateViewProps = {
  base: string;
  charityId: string;
  taxYear: number;
  donorName: string;
  person: boolean;
  current: Parameters<typeof EditCertificateForm>[0]["current"];
  gifts: number;
  totalCents: number;
  status: Status;
  changedSince: boolean;
  /** dd/mm/yyyy, when decided. */
  decidedOn: string | null;
  /** dd/mm/yyyy, when the decline email went (null: it hasn't). */
  declineEmailedOn: string | null;
  /** The list is with Givezy: sent on (dd/mm/yyyy), and whether it is being issued. */
  run: { sentOn: string; issuing: boolean } | null;
  phone: string;
  email: string;
  previewHtml: string;
  actions: { approve: Action; decline: Action; reopen: Action; edit: Action };
  next: { href: string; donorName: string } | null;
};

/**
 * One planned s18A receipt before it is issued (09/11/2026): where it stands, the decision (Approve, Correct the
 * name or address, Decline, or back to To check), and a preview in the receipt's own layout, marked "Preview,
 * not issued". The page (page.tsx) loads the data and checks who may see it; this only shows it.
 */
export function CertificateView(p: CertificateViewProps) {
  const hasContact = Boolean(p.phone && p.email);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Check an s18A receipt"
        back={<BackLink href={p.base}>← s18A receipts</BackLink>}
        intro={<>{taxYearLabel(p.taxYear)}. Nothing goes to the donor until you approve it and Givezy signs off your list.</>}
      />

      <Card>
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-lg font-semibold text-indigo [overflow-wrap:anywhere]" dir="auto">{p.donorName}</p>
            <Badge tone={TONE[p.status]}>{WORDS[p.status]}</Badge>
          </div>
          <p className="text-muted">
            {p.gifts} {p.gifts === 1 ? "donation" : "donations"}, <span className="font-semibold text-indigo tabular-nums">{formatRand(p.totalCents)}</span> in all
          </p>
          {p.changedSince ? (
            <Notice tone="warning">You approved this receipt before, but its donations changed since (a gift was refunded or paid late). Check it again.</Notice>
          ) : null}
          {p.status === "declined" ? (
            <p>
              Declined on {p.decidedOn}.{" "}
              {p.declineEmailedOn ? `We emailed the donor on ${p.declineEmailedOn} to contact you.` : "The email to the donor hasn't gone yet."} It&apos;s left out of your list.
            </p>
          ) : p.status !== "to_check" ? (
            <p>{WORDS[p.status]} on {p.decidedOn}. It&apos;s issued with your list once Givezy has signed it off.</p>
          ) : null}
        </div>
      </Card>

      {p.run ? (
        <Notice>
          You sent this list to Givezy on {p.run.sentOn}, so it can&apos;t change now.{" "}
          {p.run.issuing ? "The receipts are being issued." : <>To change a receipt, <Link href={p.base} className="text-brand underline">take back your approval</Link> first.</>}
        </Notice>
      ) : (
        <Card title="Your decision">
          <div className="space-y-5 text-sm">
            {p.status === "to_check" || p.status === "declined" ? (
              <div className="space-y-2">
                <p>The name, address and donations look right? Approve it.</p>
                <ApproveCertificateForm action={p.actions.approve} />
              </div>
            ) : null}

            <details className="rounded-card border border-border p-3">
              <summary className="cursor-pointer font-semibold text-brand">Correct the name or address, then approve</summary>
              <div className="mt-3 space-y-3">
                <p className="text-muted">
                  Fix a spelling or an address SARS needs on the receipt. The change is made on the donor&apos;s recorded details for these donations,
                  so the receipt and your SARS file (IT3(d)) show the same thing.
                </p>
                <EditCertificateForm action={p.actions.edit} person={p.person} current={p.current} />
                <p className="text-xs text-muted">
                  ID or tax number wrong? That can&apos;t be changed here, because it decides who the receipt is for. Ask the donor to ask for a
                  correction from their Givezy account (Account, Your data).
                </p>
              </div>
            </details>

            {p.status === "declined" ? (
              <div className="space-y-2">
                {!p.declineEmailedOn && hasContact ? <DeclineCertificateForm action={p.actions.decline} donorName={p.donorName} phone={p.phone} email={p.email} again /> : null}
                <p>Spoken to the donor? Put it back on your list to check again. We won&apos;t email them.</p>
                <ReopenCertificateForm action={p.actions.reopen} />
              </div>
            ) : hasContact ? (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="font-semibold text-indigo">Something&apos;s not right with this donor?</p>
                <p className="text-muted">
                  Decline it. It&apos;s left out of your list, and we email the donor to contact you on <span className="whitespace-nowrap">{p.phone}</span> or{" "}
                  <span className="[overflow-wrap:anywhere]">{p.email}</span>.
                </p>
                <DeclineCertificateForm action={p.actions.decline} donorName={p.donorName} phone={p.phone} email={p.email} />
              </div>
            ) : (
              <Notice tone="warning">
                To decline a receipt, add your charity&apos;s contact phone number and email first, so the donor knows how to reach you:{" "}
                <Link href={`/charity-admin/${p.charityId}/application?step=contact`} className="text-brand underline">Contact person</Link>.
              </Notice>
            )}

            {p.status === "approved" || p.status === "edited" ? (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-muted">Changed your mind? Put it back to check.</p>
                <ReopenCertificateForm action={p.actions.reopen} />
              </div>
            ) : null}
          </div>
        </Card>
      )}

      <p className="text-xs text-muted">
        An amount or a donation wrong? Amounts, dates and donations come only from recorded donations, so the receipt always matches your SARS file.
        Record a missing gift, or correct or remove one you recorded, on <Link href={`/charity-admin/${p.charityId}/donations`} className="text-brand underline">Donations</Link>.
        A card gift can&apos;t be changed there: tell us (<SupportContact />).
      </p>

      <section aria-labelledby="preview-title" className="space-y-2">
        <h2 id="preview-title" className="font-semibold text-indigo">Preview, not issued</h2>
        <p className="text-sm text-muted">
          The receipt as the donor will get it, with a receipt number once it&apos;s issued. Their ID or tax number is on it, but it isn&apos;t shown on the dashboard.
        </p>
        <iframe
          title={`Preview of the s18A receipt for ${p.donorName}, not issued`}
          srcDoc={p.previewHtml}
          sandbox="allow-same-origin"
          className="h-[70rem] w-full rounded-card border border-border bg-surface"
        />
      </section>

      {p.next ? (
        <p className="text-sm">
          <Link href={p.next.href} className="text-brand underline">
            Next to check: <span dir="auto">{p.next.donorName}</span>
          </Link>
        </p>
      ) : null}
    </div>
  );
}
