import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { Card, Notice } from "@/components/card";
import { DocumentList, OrganisationSummary, PrivateSummary } from "@/components/charity-summary";
import { requirePlatformAdmin } from "@/lib/auth";
import { applicationChecklist, isComplete } from "@/lib/charity/checklist";
import { charityBadges } from "@/lib/charities";
import { loadCharityForManager } from "@/lib/charity/queries";
import { statusLabels, type CharityStatus } from "@/lib/charity/status";
import { formatDate } from "@/lib/dates";
import { getGateway } from "@/lib/gateway";
import { createClient } from "@/lib/supabase/server";
import {
  addCharityAdmin,
  adminUploadDocument,
  approveCharity,
  removeCharityAdmin,
  resetSecondStep,
  setUpReceipts,
  connectToGateway,
  reinstateCharity,
  rejectCharity,
  changeBankDetails,
  revealBankAccount,
  revokeS18a,
  suspendCharity,
} from "./actions";
import { UploadForm } from "@/app/charity-admin/[id]/application/forms";
import { canIssue18a } from "@/lib/charities";
import { AddAdminForm, ApproveForm, ChangeBankForm, ReasonForm, ReceiptsForm, SimpleForm } from "./forms";

export const metadata: Metadata = { title: "Review charity" };

export default async function AdminCharityPage({ params }: PageProps<"/admin/charities/[id]">) {
  await requirePlatformAdmin();
  const { id } = await params;
  const { charity, priv, documents } = await loadCharityForManager(id);
  const supabase = await createClient();
  const [{ data: memberships }, { data: history }] = await Promise.all([
    supabase.from("charity_admins").select("user_id, role").eq("charity_id", id),
    supabase
      .from("audit_log")
      .select("id, action, details, created_at")
      .eq("entity_type", "charity")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // charity_admins links to auth users, so look up their emails separately.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email")
    .in("id", (memberships ?? []).map((m) => m.user_id));
  const emailOf = new Map((profiles ?? []).map((p) => [p.id, p.email as string]));
  const admins = (memberships ?? []).map((m) => ({ userId: m.user_id as string, email: emailOf.get(m.user_id) ?? "Unknown", role: m.role }));

  const status = statusLabels[charity.status as CharityStatus];
  const checklist = applicationChecklist({ charity, priv, documentTypes: documents.map((d) => d.document_type) });
  const badges = charityBadges(charity);
  const hasMandateDoc = documents.some((d) => d.document_type === "receipting_mandate");

  // A misconfigured gateway must not take this page down.
  let gatewayName: string | null = null;
  try {
    gatewayName = getGateway().name;
  } catch (e) {
    console.error(e);
  }
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/charities" className="text-sm text-muted">← Charities</Link>
        <h1 className="mt-1 text-xl font-semibold">{charity.name_en}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          {badges.verified ? <Badge tone="brand">Verified</Badge> : null}
          {badges.s18a ? <Badge tone="success">s18A</Badge> : null}
          {charity.is_s18a && !badges.s18a ? <Badge tone="warning">s18A confirmed, mandate missing</Badge> : null}
        </div>
      </div>

      {charity.rejection_reason ? (
        <Notice tone="danger">
          <p className="font-medium">{charity.status === "suspended" ? "Suspension reason" : "Last review note"}</p>
          <p className="mt-1 whitespace-pre-line">{charity.rejection_reason}</p>
        </Notice>
      ) : null}

      {charity.status === "pending_review" ? (
        <Card title="Decision">
          {isComplete(checklist) ? null : <Notice tone="warning">The application is incomplete.</Notice>}
          <div className="space-y-5">
            <ApproveForm
              action={approveCharity.bind(null, id)}
              hasS18a={Boolean(charity.s18a_reference)}
              hasMandate={hasMandateDoc}
            />
            <div className="border-t border-border pt-4">
              <ReasonForm action={rejectCharity.bind(null, id)} label="What needs fixing? The charity sees this."
                submitLabel="Send back for changes" />
            </div>
          </div>
        </Card>
      ) : null}

      {charity.status === "approved" ? (
        <Card title="Payments">
          {charity.gateway === gatewayName && charity.gateway_subaccount_ref ? (
            <p className="text-sm">Connected to the payment gateway. Account {charity.gateway_subaccount_ref}.</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">
                Not connected yet. Connecting registers the charity&apos;s bank account with the payment gateway so
                donations settle straight to it.
              </p>
              <SimpleForm action={connectToGateway.bind(null, id)} submitLabel="Connect to payment gateway" />
            </>
          )}
        </Card>
      ) : null}

      <Card title="Organisation"><OrganisationSummary c={charity} /></Card>
      <Card title="Contact and bank">
        <PrivateSummary p={priv} />
        <div className="mt-3">
          <SimpleForm action={revealBankAccount.bind(null, id)} submitLabel="Show full account number" />
          <p className="mt-1 text-xs text-muted">Shown once and logged in the audit trail.</p>
        </div>
        {charity.status !== "draft" && charity.status !== "rejected" ? (
          <details className="mt-4 border-t border-border pt-3">
            <summary className="cursor-pointer text-sm font-medium">Change the bank details</summary>
            <p className="my-2 text-xs text-muted">
              The charity cannot change these once it has applied. Check the new bank confirmation letter first. The charity
              comes off the payment gateway until you connect it again, and its contact is emailed.
            </p>
            <ChangeBankForm
              action={changeBankDetails.bind(null, id)}
              current={{ bank_name: priv?.bank_name ?? null, bank_account_holder: priv?.bank_account_holder ?? null, bank_branch_code: priv?.bank_branch_code ?? null }}
            />
          </details>
        ) : null}
      </Card>
      <Card title="Documents">
        <DocumentList docs={documents} hrefFor={(docId) => `/documents/${docId}`} />
        {charity.status === "approved" || charity.status === "suspended" ? (
          <details className="mt-4 border-t border-border pt-3">
            <summary className="cursor-pointer text-sm font-medium">Add a document the charity sent us</summary>
            <p className="my-2 text-xs text-muted">The charity can&apos;t add documents once it has applied. Kept with the others as the record.</p>
            <UploadForm action={adminUploadDocument.bind(null, id)} showMandateDate />
          </details>
        ) : null}
      </Card>

      {(charity.status === "approved" || charity.status === "suspended") && !canIssue18a(charity) ? (
        <Card title="s18A receipts">
          <p className="mb-3 text-sm text-muted">
            Not set up yet{charity.is_s18a ? ": s18A is confirmed, the mandate isn't" : charity.mandate_signed_at ? ": the mandate is confirmed, s18A isn't" : ""}.
            When the charity sends its SARS letter and signed mandate, add them under Documents, then confirm here.
          </p>
          <ReceiptsForm
            action={setUpReceipts.bind(null, id)}
            reference={charity.s18a_reference}
            s18aDone={charity.is_s18a}
            mandateDone={Boolean(charity.mandate_signed_at)}
          />
        </Card>
      ) : null}

      <Card title="Charity admins">
        <ul className="mb-4 space-y-3 text-sm">
          {admins.map((a) => (
            <li key={a.userId} className="space-y-2 border-b border-border pb-3 last:border-0">
              <div className="flex justify-between gap-2">
                <span className="break-all font-medium">{a.email}</span>
                <span className="text-muted">{a.role}</span>
              </div>
              <SimpleForm
                action={removeCharityAdmin.bind(null, id, a.userId)}
                submitLabel="Remove access"
                confirm={`Remove ${a.email}? They will no longer see this charity's donors, donations or exports.${admins.length === 1 ? " Nobody else manages this charity." : ""}`}
              />
              <details>
                <summary className="cursor-pointer text-muted">Lost their phone? Reset their second step</summary>
                <p className="my-2 text-xs text-muted">
                  First check it is really them: call them on a number we already have, not one they give you now. Anyone
                  who can read their email could otherwise set up a new authenticator and see donors&apos; details.
                </p>
                <ReasonForm
                  action={resetSecondStep.bind(null, id, a.userId)}
                  label="How you checked it was them (kept on record)"
                  submitLabel="Reset second step"
                  confirm={`Remove ${a.email}'s authenticator app? They'll set up a new one at their next sign-in.`}
                />
              </details>
            </li>
          ))}
        </ul>
        <AddAdminForm action={addCharityAdmin.bind(null, id)} />
      </Card>

      {charity.status === "approved" ? (
        <Card title="Suspend">
          <ReasonForm action={suspendCharity.bind(null, id)} label="Reason (kept on record)" submitLabel="Suspend charity"
            confirm="Suspend this charity? It will be hidden and unable to receive donations." />
        </Card>
      ) : null}
      {charity.status === "suspended" ? (
        <Card title="Reinstate">
          <SimpleForm action={reinstateCharity.bind(null, id)} submitLabel="Reinstate charity" confirm="Make this charity public again?" />
        </Card>
      ) : null}
      {charity.is_s18a ? (
        <Card title="Remove s18A status">
          <ReasonForm action={revokeS18a.bind(null, id)} label="Reason (kept on record)" submitLabel="Remove s18A"
            confirm="Remove s18A status? No new receipts will be issued for this charity." />
        </Card>
      ) : null}

      <Card title="History">
        {history?.length ? (
          <ul className="space-y-1 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex justify-between gap-3">
                <span>{h.action.replace("charity.", "").replaceAll("_", " ")}</span>
                <span className="shrink-0 text-muted">{formatDate(h.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No history yet.</p>
        )}
      </Card>
    </div>
  );
}
