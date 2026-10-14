import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { Card, Notice } from "@/components/card";
import { DocumentList, OrganisationSummary, PrivateSummary } from "@/components/charity-summary";
import { requireViewer } from "@/lib/auth";
import { applicationChecklist, isComplete } from "@/lib/charity/checklist";
import { loadCharityForManager } from "@/lib/charity/queries";
import { statusLabels } from "@/lib/charity/status";
import {
  removeDocument,
  saveAddress,
  saveBank,
  saveContact,
  saveOrganisation,
  submitApplication,
  uploadDocument,
} from "./actions";
import { AddressForm, BankForm, ContactForm, OrganisationForm, SubmitForm, UploadForm } from "./forms";

export const metadata: Metadata = { title: "Application" };

export default async function ApplicationPage({ params }: PageProps<"/charity-admin/[id]/application">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/application`);
  const { charity, priv, documents } = await loadCharityForManager(id);
  const editable = charity.status === "draft" || charity.status === "rejected";
  const checklist = applicationChecklist({ charity, priv, documentTypes: documents.map((d) => d.document_type) });
  const status = statusLabels[charity.status as keyof typeof statusLabels];

  return (
    <div className="space-y-4">
      <div>
        <Link href="/charity-admin" className="text-sm text-muted">← Your charities</Link>
        <h1 className="mt-1 text-xl font-semibold">{charity.name_en}</h1>
        <div className="mt-2"><Badge tone={status.tone}>{status.label}</Badge></div>
      </div>

      {charity.status === "rejected" && charity.rejection_reason ? (
        <Notice tone="danger">
          <p className="font-medium">Please update your application:</p>
          <p className="mt-1 whitespace-pre-line">{charity.rejection_reason}</p>
        </Notice>
      ) : null}
      {charity.status === "pending_review" ? (
        <Notice>Thanks. Your application is with us for review. Your details are locked while we check them.</Notice>
      ) : null}
      {charity.status === "approved" ? (
        <Notice tone="success">
          Approved. You can update your public profile any time.{" "}
          <Link href={`/charity-admin/${id}/profile`} className="underline">Edit profile</Link>
        </Notice>
      ) : null}

      {editable ? (
        <>
          <Card title="Checklist">
            <ul className="space-y-1 text-sm">
              {checklist.map((i) => (
                <li key={i.key} className="flex items-center gap-2">
                  <span aria-hidden className={i.done ? "text-success" : "text-muted"}>{i.done ? "✓" : "○"}</span>
                  <span className={i.done ? "" : "text-muted"}>{i.label}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Organisation">
            <OrganisationForm action={saveOrganisation.bind(null, id)} charity={charity} />
          </Card>
          <Card title="Registered address">
            <AddressForm action={saveAddress.bind(null, id)} charity={charity} />
          </Card>
          <Card title="Contact person">
            <ContactForm action={saveContact.bind(null, id)} priv={priv} />
          </Card>
          <Card title="Bank account for donations">
            <p className="mb-3 text-sm text-muted">
              Donations settle straight into this account. It&apos;s stored encrypted, and we check it before you go live.
            </p>
            <BankForm action={saveBank.bind(null, id)} priv={priv} />
          </Card>
          <Card title="Documents">
            {charity.s18a_reference ? (
              <p className="mb-3 text-sm text-muted">
                As an s18A organisation you also sign a receipting mandate. It authorises us to issue s18A receipts in
                your name. We&apos;ll send you the mandate to sign; upload the signed copy here.
              </p>
            ) : null}
            <DocumentList docs={documents} removeAction={(docId) => removeDocument.bind(null, id, docId)} />
            <div className="mt-4 border-t border-border pt-4">
              <UploadForm action={uploadDocument.bind(null, id)} showMandateDate={Boolean(charity.s18a_reference)} />
            </div>
          </Card>
          <Card title="Submit">
            {isComplete(checklist) ? (
              <SubmitForm action={submitApplication.bind(null, id)} />
            ) : (
              <p className="text-sm text-muted">Complete every item on the checklist to submit.</p>
            )}
          </Card>
        </>
      ) : (
        <>
          <Card title="Organisation"><OrganisationSummary c={charity} /></Card>
          <Card title="Contact and bank"><PrivateSummary p={priv} /></Card>
          <Card title="Documents"><DocumentList docs={documents} /></Card>
        </>
      )}
    </div>
  );
}
