import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { Card } from "@/components/card";
import { PageHeader } from "@/components/dash";
import { platformConfig } from "@/config/platform";
import { requireViewer } from "@/lib/auth";
import { canIssue18a } from "@/lib/charities";
import { loadCharityForManager } from "@/lib/charity/queries";
import { formatDate } from "@/lib/dates";
import { firstParam } from "@/lib/form";
import { buildReceiptHtml, previewFontCss } from "@/lib/receipts/html";
import { loadCertificate } from "@/lib/receipts/review-store";
import { closedTaxYears } from "@/lib/receipts/runs";
import { approveCertificateAction, declineCertificateAction, editCertificateAction, reopenCertificateAction } from "../actions";
import { CertificateView } from "./view";

export const metadata: Metadata = { title: "Check an s18A receipt" };

/**
 * One planned s18A receipt, before it is issued (CRM build plan step 1, 09/11/2026): a preview in the receipt's
 * own layout, marked "Preview, not issued", with Approve, Correct the name or address, and Decline. Owner and
 * admins, as for "Approve all" (loadCharityForManager). Nothing reaches the donor until the charity approves and
 * Givezy signs off.
 */
export default async function CertificatePage({ params, searchParams }: PageProps<"/charity-admin/[id]/receipts/certificate">) {
  const { id } = await params;
  const sp = await searchParams;
  const taxYear = Number(firstParam(sp.year));
  const key = firstParam(sp.c) ?? "";
  await requireViewer(`/charity-admin/${id}/receipts`);
  const { charity, priv } = await loadCharityForManager(id);
  const base = `/charity-admin/${id}/receipts`;
  if (!canIssue18a(charity) || !closedTaxYears(new Date()).includes(taxYear)) notFound();
  const cert = await loadCertificate(id, taxYear, key);
  if (!cert) {
    return (
      <div className="space-y-5">
        <PageHeader title="Check an s18A receipt" back={<BackLink href={base}>← s18A receipts</BackLink>} />
        <Card>
          <p className="text-sm">
            This s18A receipt isn&apos;t on your list any more. A gift on it may have been refunded or paid since, or the receipt has been issued.
            Nothing was changed. <Link href={base} className="text-brand underline">Your list</Link> is up to date.
          </p>
        </Card>
      </div>
    );
  }
  const r = cert.receipt;
  const act = (fn: typeof approveCertificateAction) => fn.bind(null, id, taxYear, key);
  return (
    <CertificateView
      base={base}
      charityId={id}
      taxYear={taxYear}
      donorName={cert.donorName}
      person={cert.donorType === "individual"}
      current={cert.current}
      gifts={r.donationIds.length}
      totalCents={r.totalCents}
      status={r.status}
      changedSince={r.changedSince}
      decidedOn={r.decision ? formatDate(r.decision.decidedAt) : null}
      declineEmailedOn={r.decision?.declineEmailedAt ? formatDate(r.decision.declineEmailedAt) : null}
      run={cert.run ? { sentOn: formatDate(cert.run.charity_approved_at), issuing: cert.run.status === "issuing" } : null}
      phone={priv?.contact_phone?.trim() ?? ""}
      email={priv?.contact_email?.trim() ?? ""}
      previewHtml={buildReceiptHtml({
        details: cert.details,
        reference: "Not issued yet",
        draft: true,
        mark: "Preview, not issued",
        // Charities never see any part of a donor's ID or tax number (decided 15/10/2026).
        hideIdNumbers: true,
        screen: true,
        fontCss: previewFontCss,
        platformName: platformConfig.appName,
        logoHtml: `<img src="/logo.png" alt="${platformConfig.appName}">`,
      })}
      actions={{ approve: act(approveCertificateAction), decline: act(declineCertificateAction), reopen: act(reopenCertificateAction), edit: act(editCertificateAction) }}
      next={cert.next ? { href: `${base}/certificate?year=${taxYear}&c=${cert.next.key}`, donorName: cert.next.donorName } : null}
    />
  );
}
