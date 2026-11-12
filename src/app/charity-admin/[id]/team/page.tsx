import type { Metadata } from "next";
import { Badge } from "@/components/badge";
import { Card, Notice } from "@/components/card";
import { PageHeader } from "@/components/dash";
import { DonePanel, formKey } from "@/components/done-panel";
import { requireViewer } from "@/lib/auth";
import { loadCharityForManager } from "@/lib/charity/queries";
import { ROLE_LABEL, ROLE_SUMMARY, ROLES } from "@/lib/charity/permissions";
import { listTeam, viewerRole } from "@/lib/charity/team";
import { formatDate } from "@/lib/dates";
import { addTeamMember, changeMemberRole, removeTeamMember } from "./actions";
import { AddMemberForm, RemoveMemberForm, RoleForm } from "./forms";

export const metadata: Metadata = { title: "Team" };

/** Who can use this dashboard, in which role. The owner adds and removes people and sets roles; everyone sees the list. */
export default async function TeamPage({ params, searchParams }: PageProps<"/charity-admin/[id]/team">) {
  const { id } = await params;
  const sp = await searchParams;
  const viewer = await requireViewer(`/charity-admin/${id}/team`);
  const { charity } = await loadCharityForManager(id);
  const [team, role] = await Promise.all([listTeam(id), viewerRole(id)]);
  const owner = role === "owner";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Team"
        intro="People who can sign in to this dashboard, and what each person's role lets them do. Only the owner adds or removes people and changes roles."
      />
      <DonePanel charity={charity} sp={sp} here={`/charity-admin/${id}/team`} />
      {!owner && role ? <Notice>You&apos;re {ROLE_LABEL[role] === "Admin" ? "an" : "a"} {ROLE_LABEL[role].toLowerCase()} here. To add or remove someone or change a role, ask your charity&apos;s owner.</Notice> : null}

      <Card title={`Who has access (${team.length})`}>
        <ul className="divide-y divide-border text-sm">
          {team.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-navy [overflow-wrap:anywhere]">{m.email || "A Givezy account"}{m.userId === viewer.userId ? <span className="text-muted"> (you)</span> : null}</p>
                <p className="text-xs text-muted">Since {formatDate(m.since)}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 has-[[role=alertdialog]]:basis-full">
                <Badge tone={m.role === "owner" ? "brand" : undefined}>{ROLE_LABEL[m.role]}</Badge>
                {owner && (m.role !== "owner" || m.userId === viewer.userId) ? (
                  <RemoveMemberForm action={removeTeamMember.bind(null, id, m.userId)} email={m.email} self={m.userId === viewer.userId} />
                ) : null}
              </div>
              {owner && m.role !== "owner" ? (
                <div className="w-full max-w-md">
                  <RoleForm key={`${m.userId}-${m.role}`} action={changeMemberRole.bind(null, id, m.userId)} current={m.role} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="What each role can do">
        <ul className="space-y-2 text-sm">
          {ROLES.map((r) => (
            <li key={r}>
              <span className="font-semibold text-navy">{ROLE_LABEL[r]}.</span> <span className="text-muted">{ROLE_SUMMARY[r]}</span>
            </li>
          ))}
        </ul>
      </Card>

      {owner ? (
        <Card title="Give someone access">
          <p className="mb-3 text-sm text-muted">
            Choose their role. Everyone except a viewer sees donors&apos; contact details, so add only people you trust with them. The first time they sign in they set up a second step on their phone.
          </p>
          {charity.status === "draft" || charity.status === "rejected" ? (
            <p className="text-sm text-muted">You can add people once your application is sent to Givezy.</p>
          ) : (
            <AddMemberForm key={formKey(sp)} action={addTeamMember.bind(null, id)} />
          )}
        </Card>
      ) : null}
    </div>
  );
}
