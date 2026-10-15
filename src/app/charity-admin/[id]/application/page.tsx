import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { Card, Notice } from "@/components/card";
import { DocumentList, OrganisationSummary, PrivateSummary } from "@/components/charity-summary";
import { requireViewer } from "@/lib/auth";
import { applicationChecklist, applicationSteps, currentStep, isComplete } from "@/lib/charity/checklist";
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

export default async function ApplicationPage({ params, searchParams }: PageProps<"/charity-admin/[id]/application">) {
  const { id } = await params;
  const { step: asked } = (await searchParams) as { step?: string };
  await requireViewer(`/charity-admin/${id}/application`);
  const { charity, priv, documents } = await loadCharityForManager(id);
  const editable = charity.status === "draft" || charity.status === "rejected";
  const checklist = applicationChecklist({ charity, priv, documentTypes: documents.map((d) => d.document_type) });
  const status = statusLabels[charity.status as keyof typeof statusLabels];
  const steps = applicationSteps(checklist);
  const step = currentStep(steps, asked);
  const at = steps.indexOf(step);
  const doneCount = steps.filter((s) => s.done).length;
  const dataSteps = steps.length - 1;
  const href = (key: string) => `/charity-admin/${id}/application?step=${key}`;

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
          {/* Guided: one step at a time, with a progress bar and the steps as a row of links. */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">{doneCount} of {dataSteps} steps done</span>
              <span className="text-muted">You can stop and come back any time. Everything saves as you go.</span>
            </div>
            <div className="h-2 rounded-full bg-honey-soft" role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={dataSteps} aria-label="Application progress">
              <div className="h-2 rounded-full bg-sage" style={{ width: `${Math.round((doneCount / dataSteps) * 100)}%` }} />
            </div>
            <nav aria-label="Application steps" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm">
              {steps.map((s, i) => (
                <Link
                  key={s.key}
                  href={href(s.key)}
                  aria-current={s.key === step.key ? "step" : undefined}
                  className={`shrink-0 rounded-full border px-3 py-1.5 ${s.key === step.key ? "border-brand bg-brand-soft text-indigo" : "border-border"}`}
                >
                  <span aria-hidden>{s.done ? "✓ " : `${i + 1}. `}</span>
                  {s.label}
                  {s.done ? <span className="sr-only"> (done)</span> : null}
                </Link>
              ))}
            </nav>
          </div>

          <Card title={`Step ${at + 1} of ${steps.length}: ${step.label}`}>
            <p className="mb-3 text-sm text-muted">{step.hint}</p>
            {step.key === "organisation" ? <OrganisationForm action={saveOrganisation.bind(null, id)} charity={charity} /> : null}
            {step.key === "address" ? <AddressForm action={saveAddress.bind(null, id)} charity={charity} /> : null}
            {step.key === "contact" ? <ContactForm action={saveContact.bind(null, id)} priv={priv} /> : null}
            {step.key === "bank" ? (
              <>
                <p className="mb-3 text-sm text-muted">
                  Donations settle straight into this account. It&apos;s stored encrypted, and we check it before you go live.
                </p>
                <BankForm action={saveBank.bind(null, id)} priv={priv} />
              </>
            ) : null}
            {step.key === "documents" ? (
              <>
                <ul className="mb-3 space-y-1 text-sm">
                  {checklist.filter((i) => ["bank_confirmation", "pbo_approval", "s18a_approval", "receipting_mandate"].includes(i.key)).map((i) => (
                    <li key={i.key} className="flex items-center gap-2">
                      <span aria-hidden className={i.done ? "text-success" : "text-muted"}>{i.done ? "✓" : "○"}</span>
                      <span className={i.done ? "" : "text-muted"}>{i.label}</span>
                    </li>
                  ))}
                </ul>
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
              </>
            ) : null}
            {step.key === "submit" ? (
              isComplete(checklist) ? (
                <SubmitForm action={submitApplication.bind(null, id)} />
              ) : (
                <div className="space-y-2 text-sm">
                  <p className="text-muted">A few steps still need finishing before you can submit:</p>
                  <ul className="space-y-1">
                    {steps.filter((s) => s.key !== "submit" && !s.done).map((s) => (
                      <li key={s.key}><Link href={href(s.key)} className="text-brand underline">{s.label}</Link></li>
                    ))}
                  </ul>
                </div>
              )
            ) : null}
          </Card>

          <div className="flex justify-between text-sm">
            {at > 0 ? <Link href={href(steps[at - 1].key)} className="rounded-control border border-border px-4 py-2">Back</Link> : <span />}
            {at < steps.length - 1 ? (
              <Link href={href(steps[at + 1].key)} className="rounded-control bg-brand px-4 py-2 font-medium text-brand-contrast">
                {step.done ? "Next" : "Skip for now"}
              </Link>
            ) : null}
          </div>
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
