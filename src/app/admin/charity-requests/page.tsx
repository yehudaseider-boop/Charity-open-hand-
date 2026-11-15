import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/forms/action-form";
import { SelectField } from "@/components/forms/fields";
import { charityRequestsOpen } from "@/config/app-links";
import { requirePlatformAdmin } from "@/lib/auth";
import { groupRequests, requestKey, REQUEST_STATUS_LABEL, type RequestRow } from "@/lib/charity-requests";
import { notSetUp } from "@/lib/charity-requests-store";
import { formatDate } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { decline, markJoined, retryJoined, setInvited } from "./actions";

export const metadata: Metadata = { title: "Charity requests" };

/**
 * Donors asking for charities that aren't on Givezy yet (15/11/2026), grouped by charity, most asked first. Invite
 * them from Admin, Charities; once one is live, "It joined" emails everyone who ticked the box and deletes their
 * addresses. Email addresses are never shown here: only how many want one.
 */
export default async function CharityRequestsPage() {
  await requirePlatformAdmin();
  const db = createAdminClient();
  const [open, owed, live] = await Promise.all([
    db.from("charity_requests").select("name, name_key, town, link, note, notify_email, status, created_at").in("status", ["new", "invited"]).order("created_at", { ascending: false }).limit(1000),
    db.from("charity_requests").select("charity_id").eq("status", "added").not("notify_email", "is", null).is("notified_at", null).limit(1000),
    db.from("charities").select("id, name_en").eq("status", "approved").order("name_en").limit(2000),
  ]);
  if (open.error && notSetUp(open.error.code)) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl text-indigo">Charity requests</h1>
        <p role="status" className="rounded-control bg-honey-soft p-4 text-sm">
          Not set up yet: the database change for charity requests hasn&apos;t been made. Nothing is collected until it is, and the switch is on.
        </p>
      </div>
    );
  }
  if (open.error) throw open.error;
  if (owed.error) throw owed.error;
  if (live.error) throw live.error;

  const rows: RequestRow[] = (open.data ?? []).map((r) => ({
    name: r.name as string,
    name_key: r.name_key as string,
    town: r.town as string | null,
    link: r.link as string | null,
    note: r.note as string | null,
    wants_email: Boolean(r.notify_email),
    status: r.status as RequestRow["status"],
    created_at: r.created_at as string,
  }));
  const groups = groupRequests(rows);
  const charities = (live.data ?? []).map((c) => ({ value: c.id as string, label: c.name_en as string, key: requestKey(c.name_en as string) }));
  const nameOf = new Map(charities.map((c) => [c.value, c.label]));
  const owedBy = new Map<string, number>();
  for (const r of owed.data ?? []) owedBy.set(r.charity_id as string, (owedBy.get(r.charity_id as string) ?? 0) + 1);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-indigo">Charity requests</h1>
      <p className="text-sm text-muted">
        Charities donors asked for that aren&apos;t on Givezy yet, most asked first. Invite one from{" "}
        <Link href="/admin/charities" className="font-semibold text-brand underline">Admin, Charities</Link>, then mark it invited here. Once it is
        live, choose it under &quot;It joined&quot;: everyone who ticked &quot;Email me when it joins&quot; gets one email, and their address is deleted.
      </p>
      {!charityRequestsOpen() ? (
        <p role="status" className="rounded-control bg-honey-soft p-3 text-sm">The request form is switched off, so no new requests are coming in.</p>
      ) : null}

      {owedBy.size ? (
        <section aria-labelledby="owed" className="space-y-3 rounded-card border-2 border-danger bg-danger-soft p-4">
          <h2 id="owed" className="font-semibold text-danger">Joined, but some emails didn&apos;t go</h2>
          <ul className="space-y-2">
            {[...owedBy.entries()].map(([id, count]) => (
              <li key={id} className="space-y-2 text-sm">
                <p>{nameOf.get(id) ?? "A charity that is no longer live"}: {count} {count === 1 ? "email" : "emails"} not sent yet.</p>
                <ActionForm action={retryJoined.bind(null, id)} submitLabel="Try again" pendingLabel="Sending…" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {groups.length ? (
        <ul className="space-y-3">
          {groups.map((g) => {
            const match = charities.find((c) => c.key === g.key);
            return (
              <li key={g.key} className="space-y-3 rounded-card border border-border bg-surface p-4 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="min-w-0 font-display text-lg font-bold text-indigo [overflow-wrap:anywhere]" dir="auto">{g.name}</p>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${g.status === "invited" ? "bg-brand-soft text-brand" : "bg-honey-soft text-navy"}`}>
                    {REQUEST_STATUS_LABEL[g.status]}
                  </span>
                </div>
                <p className="text-muted">
                  {g.asks} {g.asks === 1 ? "donor asked" : "donors asked"} · {g.wantEmail} {g.wantEmail === 1 ? "wants" : "want"} an email when it joins · {g.asks === 1 ? formatDate(g.lastAt) : `${formatDate(g.firstAt)} to ${formatDate(g.lastAt)}`}
                </p>
                {g.towns.length ? <p><span className="font-semibold">Where: </span><span dir="auto">{g.towns.join(" · ")}</span></p> : null}
                {g.links.length ? (
                  <div>
                    <p className="font-semibold">Links (typed by donors: check before opening)</p>
                    <ul className="mt-1 space-y-1">
                      {g.links.map((l) => <li key={l} className="select-all break-all font-mono text-xs">{l}</li>)}
                    </ul>
                  </div>
                ) : null}
                {g.notes.length ? (
                  <div>
                    <p className="font-semibold">Notes</p>
                    <ul className="mt-1 space-y-1">
                      {g.notes.map((n) => <li key={n} dir="auto" className="whitespace-pre-wrap text-muted [overflow-wrap:anywhere]">{n}</li>)}
                    </ul>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-border pt-3">
                  <ActionForm
                    action={setInvited.bind(null, g.key, g.status !== "invited")}
                    submitLabel={g.status === "invited" ? "Mark as new again" : "Mark as invited"}
                  />
                  <ActionForm
                    action={decline.bind(null, g.key)}
                    submitLabel="Not adding"
                    confirm={`Close the ${g.asks === 1 ? "request" : `${g.asks} requests`} for ${g.name}? ${g.wantEmail ? "The email addresses on them are deleted and nobody is told. " : ""}This can't be undone.`}
                    confirmLabel="Yes, close them"
                  />
                </div>
                {charities.length ? (
                  <ActionForm
                    action={markJoined.bind(null, g.key)}
                    submitLabel="It joined"
                    pendingLabel="Sending emails…"
                    confirm={g.wantEmail ? `Email ${g.wantEmail} ${g.wantEmail === 1 ? "donor" : "donors"} that it joined, and delete their addresses? This can't be undone.` : "Mark these requests as joined?"}
                    confirmLabel={g.wantEmail ? "Yes, send the emails" : "Yes, mark as joined"}
                    className="rounded-control bg-honey-soft p-3"
                  >
                    <SelectField name="charity_id" label="It joined as" required options={charities.map(({ value, label }) => ({ value, label }))} defaultValue={match?.value ?? null} />
                  </ActionForm>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p role="status" className="rounded-card border border-border bg-surface p-5 text-sm text-muted">No charity requests waiting. When donors ask for a charity, it shows here.</p>
      )}
    </div>
  );
}
