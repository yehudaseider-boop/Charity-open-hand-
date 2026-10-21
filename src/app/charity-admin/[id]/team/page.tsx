import type { Metadata } from "next";
import { Badge } from "@/components/badge";
import { Card, Notice } from "@/components/card";
import { DonePanel, formKey } from "@/components/done-panel";
import { requireViewer } from "@/lib/auth";
import { loadCharityForManager } from "@/lib/charity/queries";
import { listTeam, viewerRole } from "@/lib/charity/team";
import { formatDate } from "@/lib/dates";
import { addTeamMember, removeTeamMember } from "./actions";
import { AddMemberForm, RemoveMemberForm } from "./forms";

export const metadata: Metadata = { title: "Team" };

/** Who can use this dashboard. The owner adds and removes people; everyone sees the list. */
export default async function TeamPage({ params, searchParams }: PageProps<"/charity-admin/[id]/team">) {
  const { id } = await params;
  const sp = await searchParams;
  const viewer = await requireViewer(`/charity-admin/${id}/team`);
  const { charity } = await loadCharityForManager(id);
  const [team, role] = await Promise.all([listTeam(id), viewerRole(id)]);
  const owner = role === "owner";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-indigo">Team</h1>
        <p className="text-sm text-muted">
          People who can sign in to this dashboard. Admins can do everything here except add or remove people, and send emails to your donors. Only the owner can do those.
        </p>
      </div>
      <DonePanel charity={charity} sp={sp} here={`/charity-admin/${id}/team`} />
      {!owner ? <Notice>You&apos;re an admin. To add or remove someone, ask your charity&apos;s owner.</Notice> : null}

      <Card title={`Who has access (${team.length})`}>
        <ul className="divide-y divide-border text-sm">
          {team.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="break-all font-medium">{m.email || "A Givezy account"}{m.userId === viewer.userId ? <span className="text-muted"> (you)</span> : null}</p>
                <p className="text-xs text-muted">Since {formatDate(m.since)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={m.role === "owner" ? "brand" : undefined}>{m.role === "owner" ? "Owner" : "Admin"}</Badge>
                {owner && (m.role === "admin" || m.userId === viewer.userId) ? (
                  <RemoveMemberForm action={removeTeamMember.bind(null, id, m.userId)} email={m.email} self={m.userId === viewer.userId} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {owner ? (
        <Card title="Give someone access">
          <p className="mb-3 text-sm text-muted">
            They become an admin. They&apos;ll see your donations and donors&apos; details, so add only people you trust with them. The first time they sign in they set up a second step on their phone.
          </p>
          <AddMemberForm key={formKey(sp)} action={addTeamMember.bind(null, id)} />
        </Card>
      ) : null}
    </div>
  );
}
