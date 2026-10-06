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
import { createClient } from "@/lib/supabase/server";
import {
  addCharityAdmin,
  approveCharity,
  reinstateCharity,
  rejectCharity,
  revealBankAccount,
  revokeS18a,
  suspendCharity,
} from "./actions";
import { AddAdminForm, ApproveForm, ReasonForm, SimpleForm } from "./forms";

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
  const admins = (memberships ?? []).map((m) => ({ email: emailOf.get(m.user_id) ?? "Unknown", role: m.role }));

  const status = statusLabels[charity.status as CharityStatus];
  const checklist = applicationChecklist({ charity, priv, documentTypes: documents.map((d) => d.document_type) });
  const badges = charityBadges(charity);
  const hasMandateDoc = documents.some((d) => d.document_type === "receipting_mandate");

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

      <Card title="Organisation"><OrganisationSummary c={charity} /></Card>
      <Card title="Contact and bank">
        <PrivateSummary p={priv} />
        <div className="mt-3">
          <SimpleForm action={revealBankAccount.bind(null, id)} submitLabel="Show full account number" />
          <p className="mt-1 text-xs text-muted">Shown once and logged in the audit trail.</p>
        </div>
      </Card>
      <Card title="Documents">
        <DocumentList docs={documents} hrefFor={(docId) => `/documents/${docId}`} />
      </Card>

      <Card title="Charity admins">
        <ul className="mb-3 space-y-1 text-sm">
          {admins.map((a) => (
            <li key={a.email} className="flex justify-between gap-2">
              <span className="break-all">{a.email}</span>
              <span className="text-muted">{a.role}</span>
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
