import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { Card, Notice } from "@/components/card";
import { blueAction, PageHeader, secondaryAction } from "@/components/dash";
import { DonePanel, formKey } from "@/components/done-panel";
import { DocumentList, OrganisationSummary, PrivateSummary } from "@/components/charity-summary";
import { requireViewer } from "@/lib/auth";
import { applicationChecklist, applicationSteps, currentStep, isComplete } from "@/lib/charity/checklist";
import { loadCharityForManager } from "@/lib/charity/queries";
import { isOwner } from "@/lib/charity/team";
import { statusLabels } from "@/lib/charity/status";
import { reviewWithin } from "@/lib/charity/review-time";
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

/** What each document must show (the same words as the apply page). DRAFT WORDING for Yehuda to approve. */
const documentHelp: Record<string, string> = {
  bank_confirmation: "A letter from your bank showing the account is in the organisation's name, with the account number and branch code.",
  pbo_approval: "The SARS letter confirming your PBO status.",
  s18a_approval: "The SARS letter that lets you issue s18A receipts.",
  receipting_mandate: "Our receipting mandate, signed. It lets us issue s18A receipts in your name.",
};

export default async function ApplicationPage({ params, searchParams }: PageProps<"/charity-admin/[id]/application">) {
  const { id } = await params;
  const sp = await searchParams;
  const { step: asked } = sp as { step?: string };
  await requireViewer(`/charity-admin/${id}/application`);
  const { charity, priv, documents } = await loadCharityForManager(id);
  const owner = await isOwner(id);
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
    <div className="space-y-5">
      <PageHeader
        back={<Link href="/charity-admin" className="text-muted hover:text-brand hover:underline">← Your charities</Link>}
        title="Application"
        intro={<Badge tone={status.tone}>{status.label}</Badge>}
      />

      <DonePanel charity={charity} sp={sp} here={`/charity-admin/${id}/application?step=${step.key}`} />

      {charity.status === "suspended" ? (
        <Notice tone="danger">
          <p className="font-medium">Your page is paused, so donors can&apos;t give to you right now.</p>
          {charity.rejection_reason ? <p className="mt-1 whitespace-pre-line">The reason: {charity.rejection_reason}</p> : null}
        </Notice>
      ) : null}
      {charity.status === "rejected" && charity.rejection_reason ? (
        <Notice tone="danger">
          <p className="font-medium">Please update your application:</p>
          <p className="mt-1 whitespace-pre-line">{charity.rejection_reason}</p>
        </Notice>
      ) : null}
      {charity.status === "pending_review" ? (
        // What happens next, in the same three steps as the apply page (30/10/2026).
        <section aria-labelledby="whats-next" className="rounded-card border-2 border-brand bg-brand p-5 text-white sm:p-6">
          <h2 id="whats-next" className="font-display text-xl font-bold text-white!">Your application is with us</h2>
          <p className="mt-1 text-sm text-white/85">Your details are locked while we check them. Nothing else is needed from you right now.</p>
          <ol className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { title: "Submitted", body: "We have everything we asked for.", done: true },
              { title: `We check it within ${reviewWithin()}`, body: "A person checks your registration, bank letter and approvals, then emails your contact person." },
              { title: "You go live", body: "Once approved, your page opens to donors. If something needs fixing, we say exactly what." },
            ].map((s, i) => (
              <li key={s.title} className="rounded-control bg-white/10 p-3 text-sm">
                <p className="font-bold text-white">{s.done ? "✓ " : `${i + 1}. `}{s.title}</p>
                <p className="mt-1 text-white/85">{s.body}</p>
              </li>
            ))}
          </ol>
          <Link href={`/charity-admin/${id}/profile`} className="pressable mt-4 inline-flex min-h-11 items-center rounded-control bg-coral px-5 font-bold text-navy">While you wait: write your public profile</Link>
        </section>
      ) : null}
      {charity.status === "approved" ? (
        <Notice tone="success">
          Approved. You can update your public profile any time.{" "}
          <Link href={`/charity-admin/${id}/profile`} className="font-semibold underline">Public profile</Link>
        </Notice>
      ) : null}

      {editable ? (
        <>
          {/* Guided: one step at a time, with a progress bar and the steps as a row of links. */}
          <div className="space-y-3 rounded-card border-2 border-border bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
              <span className="font-display text-lg font-bold text-indigo">{doneCount} of {dataSteps} steps done</span>
              <span className="text-muted">You can stop and come back any time. Everything saves as you go.</span>
            </div>
            <div className="h-2 rounded-full bg-honey-soft" role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={dataSteps} aria-label="Application progress">
              <div className="h-2 rounded-full bg-sage" style={{ width: `${Math.round((doneCount / dataSteps) * 100)}%` }} />
            </div>
            <nav aria-label="Application steps" className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 text-sm sm:-mx-6 sm:px-6">
              {steps.map((s, i) => (
                <Link
                  key={s.key}
                  href={href(s.key)}
                  aria-current={s.key === step.key ? "step" : undefined}
                  className={`inline-flex min-h-9 shrink-0 items-center rounded-full border-2 px-3.5 font-semibold transition ${s.key === step.key ? "border-brand bg-brand text-white" : s.done ? "border-border bg-surface text-navy hover:border-brand hover:text-brand" : "border-border bg-surface text-muted hover:border-brand hover:text-brand"}`}
                >
                  <span aria-hidden className="mr-1">{s.done ? "✓" : `${i + 1}.`}</span>
                  {s.label}
                  {s.done ? <span className="sr-only"> (done)</span> : null}
                </Link>
              ))}
            </nav>
          </div>

          {/* A fresh form after each action: an upload or bank number isn't left filled in. */}
          <Card key={formKey(sp, step.key)} title={`Step ${at + 1} of ${steps.length}: ${step.label}`}>
            <p className="mb-3 text-sm text-muted">{step.hint}</p>
            {/* Only what each form edits reaches the browser: the full row holds gateway and mandate details. */}
            {step.key === "organisation" ? (
              <OrganisationForm
                action={saveOrganisation.bind(null, id)}
                charity={{
                  name_en: charity.name_en, name_he: charity.name_he, legal_name_en: charity.legal_name_en, legal_name_he: charity.legal_name_he,
                  npo_number: charity.npo_number, pbo_number: charity.pbo_number, s18a_reference: charity.s18a_reference,
                }}
              />
            ) : null}
            {step.key === "address" ? (
              <AddressForm
                action={saveAddress.bind(null, id)}
                charity={{ address_line1: charity.address_line1, address_line2: charity.address_line2, suburb: charity.suburb, city: charity.city, postal_code: charity.postal_code }}
              />
            ) : null}
            {step.key === "contact" ? <ContactForm action={saveContact.bind(null, id)} priv={priv} /> : null}
            {step.key === "bank" ? (
              <>
                <p className="mb-3 text-sm text-muted">
                  Donations settle straight into this account. It&apos;s stored encrypted, and we check it before you go live.
                </p>
                {owner ? <BankForm action={saveBank.bind(null, id)} priv={priv} /> : <Notice>Only your charity&apos;s owner can set the bank account. Ask them to fill in this step.</Notice>}
              </>
            ) : null}
            {step.key === "documents" ? (
              <>
                <ul className="mb-3 space-y-1 text-sm">
                  {checklist.filter((i) => ["bank_confirmation", "pbo_approval", "s18a_approval", "receipting_mandate"].includes(i.key)).map((i) => (
                    <li key={i.key} className="flex items-start gap-2">
                      <span aria-hidden className={`mt-0.5 ${i.done ? "text-success" : "text-muted"}`}>{i.done ? "✓" : "○"}</span>
                      <span>
                        <span className={i.done ? "font-semibold" : "font-semibold text-muted"}>{i.label}</span>
                        {/* What each paper must show, in plain words, so nobody uploads the wrong one. */}
                        {documentHelp[i.key] && !i.done ? <span className="block text-muted">{documentHelp[i.key]}</span> : null}
                      </span>
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
                      <li key={s.key}><Link href={href(s.key)} className="font-semibold text-brand underline hover:text-indigo">{s.label}</Link></li>
                    ))}
                  </ul>
                </div>
              )
            ) : null}
          </Card>

          <div className="flex justify-between gap-2">
            {at > 0 ? <Link href={href(steps[at - 1].key)} className={secondaryAction}>Back</Link> : <span />}
            {at < steps.length - 1 ? (
              <Link href={href(steps[at + 1].key)} className={blueAction}>
                {step.done ? "Next" : "Skip for now"}
              </Link>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <Card title="Organisation"><OrganisationSummary c={charity} /></Card>
          <Card title="Contact and bank"><PrivateSummary p={priv} /></Card>
          {/* The contact person can change at any time: our emails (approval, bank changes) go to them. */}
          <Card title="Contact person">
            <p className="mb-3 text-sm text-muted">Who we email about your charity. If you change the email, we let the old address know too.</p>
            <ContactForm action={saveContact.bind(null, id)} priv={priv} />
          </Card>
          <Card title="Documents"><DocumentList docs={documents} /></Card>
        </>
      )}
    </div>
  );
}
