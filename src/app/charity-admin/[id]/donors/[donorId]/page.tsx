import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/badge";
import { Card } from "@/components/card";
import { requireViewer } from "@/lib/auth";
import { ERASED_DONOR, donationStatus, isErasedEmail, shownEmail } from "@/lib/charity/dashboard";
import { loadCampaignTitles, loadDonorPaidGifts, loadDonors } from "@/lib/charity/dashboard-queries";
import { donorGiving, type GivingLine } from "@/lib/charity/donor-giving";
import { lapsedDaysFor, listNotes, listReminders, listTags, tagsByDonor } from "@/lib/charity/donor-care";
import { CARE_DONE, sortReminders } from "@/lib/charity/donor-care-rules";
import { donorGroup, donorGroupsFor } from "@/lib/charity/insights";
import { loadCharityForManager } from "@/lib/charity/queries";
import { RECORDED_METHODS, type RecordedMethod } from "@/lib/charity/recorded-gifts";
import { formatDate, formatDateTime, isoDateInJhb } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { addDonorNote, addDonorReminder, addDonorTag, deleteDonorNote, deleteDonorReminder, editDonorNote, markReminder, removeDonorTag } from "../care-actions";
import { ButtonForm, NoteForm, ReminderForm, TagForm } from "../care-forms";
import { BackLink } from "@/components/back-link";

export const metadata: Metadata = { title: "Donor" };

/** One donor: their giving to this charity, their gifts, and the charity's own tags, follow-ups and notes. */
export default async function DonorPage({ params, searchParams }: PageProps<"/charity-admin/[id]/donors/[donorId]">) {
  const { id, donorId } = await params;
  const sp = await searchParams;
  await requireViewer(`/charity-admin/${id}/donors/${donorId}`);
  await loadCharityForManager(id);
  if (!/^[0-9a-f-]{36}$/i.test(donorId)) notFound();
  const donor = (await loadDonors(id)).find((d) => d.donor_id === donorId);
  if (!donor) notFound();

  const supabase = await createClient();
  const [{ data: gifts, error }, notes, reminders, tags, byDonor, lapsedDays, paidGifts, campaignTitles] = await Promise.all([
    supabase
      .from("charity_donations")
      .select("id, status, amount_cents, paid_at, created_at, recorded_method, wants_18a, campaign_id")
      .eq("charity_id", id)
      .eq("donor_id", donorId)
      .order("paid_at", { ascending: false, nullsFirst: false })
      .limit(100),
    listNotes(id, donorId),
    listReminders(id, donorId),
    listTags(id),
    tagsByDonor(id),
    lapsedDaysFor(id),
    loadDonorPaidGifts(id, donorId),
    loadCampaignTitles(id),
  ]);
  const giving = donorGiving(paidGifts, campaignTitles);
  if (error) throw error;
  const mine = new Set(byDonor.get(donorId) ?? []);
  const myTags = tags.filter((t) => mine.has(t.id));
  const today = isoDateInJhb();
  const open = sortReminders(reminders.filter((r) => !r.done_at));
  const done = reminders.filter((r) => r.done_at).slice(-5);
  const group = donorGroupsFor(lapsedDays).find((g) => g.key === donorGroup(donor, new Date(), lapsedDays));
  const name = isErasedEmail(donor.email) ? ERASED_DONOR : donor.display_name;
  const base = `/charity-admin/${id}`;

  return (
    <div className="space-y-4">
      <BackLink href={`${base}/donors`}>← Donors</BackLink>
      {typeof sp.did === "string" && CARE_DONE[sp.did] ? (
        <p role="status" className="rounded-card bg-success-soft p-3 text-sm text-success">{CARE_DONE[sp.did]}</p>
      ) : null}
      <div>
        <h1 className="font-display text-2xl text-indigo">{name}</h1>
        {shownEmail(donor.email) ? <p className="break-all text-sm text-muted">{donor.email}</p> : null}
        {donor.phone ? <p className="text-sm text-muted">{donor.phone}</p> : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {group ? <Badge tone="brand">{group.label}</Badge> : null}
          {myTags.map((t) => <Badge key={t.id}>{t.name}</Badge>)}
        </div>
      </div>

      <Card title="Giving to you">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-muted">Given in all</dt><dd className="font-semibold">{formatRand(donor.total_cents)}</dd></div>
          <div><dt className="text-muted">Gifts</dt><dd className="font-semibold">{donor.donation_count}</dd></div>
          <div><dt className="text-muted">First gift</dt><dd>{formatDate(donor.first_paid_at)}</dd></div>
          <div><dt className="text-muted">Latest gift</dt><dd>{formatDate(donor.last_paid_at)}</dd></div>
          {giving.largest ? (
            <div className="col-span-2">
              <dt className="text-muted">Largest gift</dt>
              <dd>
                <span className="font-semibold">{formatRand(giving.largest.amount_cents)}</span>
                {giving.largest.paid_at ? <span className="text-muted"> on {formatDate(giving.largest.paid_at)}</span> : null}
              </dd>
            </div>
          ) : null}
        </dl>
        {giving.byCampaign.some((l) => l.key !== "none") ? <GivingLines title="By campaign" lines={giving.byCampaign} /> : null}
        {giving.bySource.length ? <GivingLines title="How they gave" lines={giving.bySource} /> : null}
      </Card>

      <Card title={`Follow-ups${open.length ? ` (${open.length})` : ""}`}>
        <div className="space-y-3 text-sm">
          {open.length === 0 ? <p className="text-muted">Nothing to follow up. Add one below, for example a call to say thank you.</p> : null}
          <ul className="space-y-2">
            {open.map((r) => (
              <li key={r.id} className={`rounded-control border p-3 ${r.due_on <= today ? "border-warning bg-warning-soft" : "border-border"}`}>
                <p className="font-medium">{r.what}</p>
                <p className="text-xs text-muted">{r.due_on < today ? "Was due" : r.due_on === today ? "Due today" : "Due"} {formatDate(`${r.due_on}T12:00:00+02:00`)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <ButtonForm action={markReminder.bind(null, id, donorId, r.id, true)} label="Done" pending="Marking…" />
                  <ButtonForm action={deleteDonorReminder.bind(null, id, donorId, r.id)} label="Remove" pending="Removing…" confirm="Remove this follow-up? It can't be undone." confirmLabel="Yes, remove" />
                </div>
              </li>
            ))}
          </ul>
          {done.length ? (
            <details>
              <summary className="cursor-pointer text-brand">Done recently ({done.length})</summary>
              <ul className="mt-2 space-y-2">
                {done.map((r) => (
                  <li key={r.id} className="rounded-control border border-border p-3 text-muted">
                    <p className="line-through">{r.what}</p>
                    <p className="text-xs">Done {formatDateTime(r.done_at!)}</p>
                    <ButtonForm action={markReminder.bind(null, id, donorId, r.id, false)} label="Undo" pending="Putting it back…" />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <ReminderForm action={addDonorReminder.bind(null, id, donorId)} today={today} />
        </div>
      </Card>

      <Card title="Tags">
        <div className="space-y-3 text-sm">
          {myTags.length ? (
            <ul className="flex flex-wrap gap-2">
              {myTags.map((t) => (
                <li key={t.id} className="flex items-center gap-1 rounded-full border border-border px-3 py-1">
                  <span>{t.name}</span>
                  <ButtonForm action={removeDonorTag.bind(null, id, donorId, t.id)} label="Take off" pending="Taking off…" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">No tags yet. Tags are your own labels, for finding donors later (Donors, filter by tag).</p>
          )}
          <TagForm action={addDonorTag.bind(null, id, donorId)} existing={tags.filter((t) => !mine.has(t.id)).map((t) => t.name)} />
        </div>
      </Card>

      <Card title={`Notes${notes.length ? ` (${notes.length})` : ""}`}>
        <div className="space-y-3 text-sm">
          <NoteForm action={addDonorNote.bind(null, id, donorId)} />
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded-control border border-border p-3">
                <p className="whitespace-pre-wrap break-words">{n.body}</p>
                <p className="mt-1 text-xs text-muted">
                  {n.author ? `${n.author}, ` : ""}{formatDateTime(n.created_at)}{n.edited_at ? ` (edited ${formatDateTime(n.edited_at)})` : ""}
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-brand">Edit or remove</summary>
                  <div className="mt-2 space-y-2">
                    <NoteForm action={editDonorNote.bind(null, id, donorId, n.id)} defaultBody={n.body} label="Edit the note" submit="Save changes" />
                    <ButtonForm action={deleteDonorNote.bind(null, id, donorId, n.id)} label="Remove note" pending="Removing…" confirm="Remove this note? It can't be undone." confirmLabel="Yes, remove" />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card title="Gifts">
        {(gifts ?? []).length === 0 ? (
          <p className="text-sm text-muted">No gifts to show.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {(gifts ?? []).map((g) => (
              <li key={g.id as string}>
                <Link href={`${base}/donations/${g.id}`} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    {formatDate((g.paid_at ?? g.created_at) as string)}
                    {g.campaign_id ? <span className="text-muted"> · {campaignTitles.get(g.campaign_id as string) ?? "A campaign"}</span> : null}
                    {g.recorded_method ? <span className="text-muted"> · {RECORDED_METHODS[g.recorded_method as RecordedMethod] ?? "Recorded"}</span> : null}
                    {g.status !== "paid" ? <span className="text-muted"> · {donationStatus[g.status as keyof typeof donationStatus]?.label}</span> : null}
                  </span>
                  <span className="shrink-0 font-medium">{formatRand(Number(g.amount_cents))}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {(gifts ?? []).length === 100 && shownEmail(donor.email) ? (
          <p className="mt-2 text-xs text-muted">
            The latest 100 gifts. <Link href={`${base}/donations?q=${encodeURIComponent(donor.email)}`} className="text-brand underline">See them all on Donations</Link>
          </p>
        ) : null}
      </Card>
    </div>
  );
}

/** Paid gifts summed one way (by campaign, or by how they came in), largest first. */
function GivingLines({ title, lines }: { title: string; lines: GivingLine[] }) {
  return (
    <div className="mt-4 border-t border-border pt-3 text-sm">
      <h3 className="mb-1 font-semibold text-navy">{title}</h3>
      <ul className="space-y-1">
        {lines.map((l) => (
          <li key={l.key} className="flex justify-between gap-3">
            <span className="min-w-0 break-words">{l.label} <span className="text-muted">({l.count} {l.count === 1 ? "gift" : "gifts"})</span></span>
            <span className="shrink-0 font-medium">{formatRand(l.cents)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
