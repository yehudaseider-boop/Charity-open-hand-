import type { Metadata } from "next";
import Link from "next/link";
import { LiveFilterForm } from "@/components/forms/live-filter-form";
import { NoMatch } from "@/components/no-match";
import { Badge } from "@/components/badge";
import { DonePanel, formKey } from "@/components/done-panel";
import { lastThanked, optedOut } from "@/lib/charity/thank-you-send";
import { WEEKLY_LIMIT, messagedThisWeek } from "@/lib/charity/weekly-limit";
import { emailHash } from "@/lib/charity/thank-you";
import { thankOneDonor } from "./actions";
import { ThankOneForm } from "./thank-form";
import { DonorPeekLink } from "./donor-peek";
import { requireViewer } from "@/lib/auth";
import { ERASED_DONOR, isErasedEmail, safeSearch, shownEmail } from "@/lib/charity/dashboard";
import { loadDonors, loadMonthlyDonations, loadMonthlyGifts } from "@/lib/charity/dashboard-queries";
import { loadCharityForManager } from "@/lib/charity/queries";
import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { donorGroup, donorGroupsFor, isDonorGroup, monthlyByDonor } from "@/lib/charity/insights";
import { Card } from "@/components/card";
import { ActionLink, EmptyState, PageHeader, Tabs, blueAction, field, secondaryAction } from "@/components/dash";
import { lapsedDaysFor, listSegments, listTags, tagsByDonor } from "@/lib/charity/donor-care";
import { deleteCharityTag, deleteDonorList, saveDonorList, saveLapsedPeriod } from "./care-actions";
import { ButtonForm, LapsedForm, SaveListForm } from "./care-forms";
import { CARE_DONE } from "@/lib/charity/donor-care-rules";
import { loadContacts, type ContactRow } from "@/lib/charity/contacts-store";
import { contactName } from "@/lib/charity/contacts";
import { DONOR_SORTS, parseDonorSort, sortDonors } from "@/lib/charity/donor-sort";
import type { DonorRow } from "@/lib/charity/dashboard-queries";
import { MAX_REMINDERS, S18A_FILTERS, S18A_FILTER_HINTS, inS18aFilter, isS18aFilter, missingList, s18aCounts, type S18aFilter } from "@/lib/charity/s18a-reminder";
import { lastReminded, loadS18aMissing } from "@/lib/charity/s18a-reminder-send";
import type { MissingDetail } from "@/lib/donations/s18a-details";
import { isOwner, viewerCan } from "@/lib/charity/team";
import { remindS18aDetails } from "./reminder-actions";
import { ReminderForm, ReminderTick } from "./reminder-form";

/** One line of the list: a donor who gave, or someone the charity imported who hasn't given through Givezy. */
type Line =
  | { kind: "donor"; id: string; name: string; totalCents: number; firstAt: string | null; lastAt: string | null; d: DonorRow }
  | { kind: "contact"; id: string; name: string; totalCents: number; firstAt: string | null; lastAt: string | null; c: ContactRow };

export const metadata: Metadata = { title: "Donors" };
// Reminders to add s18A details are sent from this page and can take a while (as on Thank donors and Email donors).
export const maxDuration = 60;

const PAGE = 25;

export default async function DonorsPage({ params, searchParams }: PageProps<"/charity-admin/[id]/donors">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/donors`);
  const { charity } = await loadCharityForManager(id);
  const canDownload = await viewerCan(id, "export");
  const sp = await searchParams;
  const q = safeSearch(typeof sp.q === "string" ? sp.q : "");
  const asked = Math.max(1, Math.min(10_000, Number(typeof sp.page === "string" ? sp.page : 1) || 1));

  const group = isDonorGroup(sp.group) ? sp.group : null;
  // The s18A filter (CRM step 2, 10/11/2026): asked, didn't ask, or asked with details still missing.
  const s18a: S18aFilter | null = isS18aFilter(sp.s18a) ? sp.s18a : null;
  // An unknown ?sort= keeps the usual order (most given first).
  const sort = parseDonorSort(sp.sort);

  const [all, monthlyGifts, monthly, tags, byDonor, segments, lapsedDays, contacts, missingRead, owner] = await Promise.all([
    loadDonors(id), loadMonthlyGifts(id), loadMonthlyDonations(id), listTags(id), tagsByDonor(id), listSegments(id), lapsedDaysFor(id), loadContacts(id),
    // Read with the service role now that loadCharityForManager has checked access. Only what is missing comes back, never a number.
    loadS18aMissing(id).catch((e: unknown) => {
      console.error("[donors] s18A details check failed", e instanceof Error ? e.message : e);
      return null;
    }),
    isOwner(id),
  ]);
  const missing: ReadonlyMap<string, MissingDetail[]> = missingRead ?? new Map();
  const donorGroups = donorGroupsFor(lapsedDays);
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const tag = typeof sp.tag === "string" && tagName.has(sp.tag) ? sp.tag : null;
  const givesMonthly = monthlyByDonor(monthlyGifts, monthly);
  const now = new Date();
  const needle = q.toLowerCase();
  const matching = all.filter(
    (d) =>
      (!group || donorGroup(d, now, lapsedDays) === group) &&
      (!tag || (byDonor.get(d.donor_id) ?? []).includes(tag)) &&
      (!needle || d.display_name.toLowerCase().includes(needle) || d.email.toLowerCase().includes(needle)),
  );
  // Counts for the s18A filters, within the group, tag and search chosen.
  const counts = s18aCounts(matching, missing);
  const donorLines: Line[] = matching
    .filter((d) => !s18a || inS18aFilter(d, s18a, missing))
    .map((d) => ({ kind: "donor", id: d.donor_id, name: isErasedEmail(d.email) ? ERASED_DONOR : d.display_name, totalCents: d.total_cents, firstAt: d.first_paid_at, lastAt: d.last_paid_at, d }));
  // Imported donors have no giving group and no s18A request, so those filters show only people who gave.
  const contactLines: Line[] = group || s18a
    ? []
    : contacts
        .filter((c) => (!tag || c.tag_ids.includes(tag)) && (!needle || contactName(c).toLowerCase().includes(needle) || (c.email ?? "").includes(needle)))
        .map((c) => ({ kind: "contact", id: c.id, name: contactName(c), totalCents: 0, firstAt: null, lastAt: null, c }));
  const donors = sortDonors([...donorLines, ...contactLines], sort);
  const contactsShown = contactLines.length;
  // Someone imported who has since given through Givezy (the same email): both lines show, not merged.
  const gaveEmails = new Set(all.map((d) => d.email.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(donors.length / PAGE));
  // A page past the end (an old link, a typed number) shows the last page, never "No donors yet".
  const page = Math.min(asked, pages);
  const shown = donors.slice((page - 1) * PAGE, page * PAGE);
  const base = `/charity-admin/${id}/donors`;
  const href = (p: number, g: string | null = group, t: string | null = tag, f: string | null = s18a) =>
    `${base}?${new URLSearchParams({ ...(q ? { q } : {}), ...(g ? { group: g } : {}), ...(t ? { tag: t } : {}), ...(f ? { s18a: f } : {}), ...(sort ? { sort } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString()}`.replace(/\?$/, "");
  const segmentHref = (f: { group?: string; tag?: string; q?: string }) =>
    `${base}?${new URLSearchParams({ ...(f.q ? { q: f.q } : {}), ...(f.group ? { group: f.group } : {}), ...(f.tag ? { tag: f.tag } : {}), ...(sort ? { sort } : {}) }).toString()}`.replace(/\?$/, "");
  // "Say thank you": only once the page is live, never to erased donors or anyone who asked not to get them.
  const canThank = charity.status === "approved";
  const shownDonors = shown.flatMap((l) => (l.kind === "donor" ? [l.d] : []));
  const emailed = shownDonors.filter((d) => shownEmail(d.email));
  // One message a week per donor from the charity (09/11/2026): anyone who had any this week (a thank-you, a
  // reminder, a news email or appeal, the monthly thank-you) isn't offered "Say thank you" until Monday.
  const [thanked, stopped, thisWeek] = canThank
    ? await Promise.all([
        lastThanked(id, shownDonors.map((d) => d.donor_id)),
        optedOut(emailed.map((d) => d.email)),
        // If this check fails the button still shows: sending checks again and says plainly if it's this week.
        messagedThisWeek(id, emailed.map((d) => ({ donorId: d.donor_id, hash: emailHash(d.email) }))).catch((e: unknown) => {
          console.error("[donors] weekly check failed", e instanceof Error ? e.message : e);
          return new Set<string>();
        }),
      ])
    : [new Map<string, string>(), new Set<string>(), new Set<string>()];
  const here = href(page);
  const key = formKey(sp);
  // "Remind to add their details": only on "Details missing", for the owner of a live charity (as for Email donors).
  const reminding = s18a === "details_missing" && missingRead !== null;
  const canRemind = reminding && owner && charity.status === "approved";
  const reminderIds = canRemind ? donorLines.map((l) => l.id) : [];
  const reminded = reminding ? await lastReminded(id, shownDonors.map((d) => d.donor_id)) : new Map<string, string>();

  const pill = "inline-flex min-h-9 items-center rounded-full border-2 px-3.5 text-sm font-semibold transition";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Donors"
        intro="People who have given to your charity. Anonymous donors are anonymous on public pages only: you see their details because you need them to record donations. Where a donor asked for one, Givezy issues the s18A receipt in your name."
        actions={
          <>
            {canDownload ? <ActionLink download href={`/charity-admin/${id}/export/donors`}>Download donors (CSV)</ActionLink> : null}
            {canDownload ? <ActionLink download href={`/charity-admin/${id}/export/donors?format=xlsx`}>Excel</ActionLink> : null}
            {canDownload ? <ActionLink download href={`/charity-admin/${id}/export/donors?format=salesforce`}>For Salesforce</ActionLink> : null}
            <ActionLink href={`/charity-admin/${id}/donors/import`}>Import donors (CSV)</ActionLink>
          </>
        }
      />
      <DonePanel charity={charity} sp={sp} here={base} />
      {typeof sp.did === "string" && CARE_DONE[sp.did] ? (
        <p role="status" className="rounded-card bg-success-soft p-3 text-sm text-success">{CARE_DONE[sp.did]}</p>
      ) : null}

      <div className="space-y-3">
        <Tabs label="Donor groups" items={[{ key: null, label: "All" }, ...donorGroups].map((g) => ({ href: href(1, g.key), label: g.label, active: group === g.key }))} />
        {group ? <p className="text-xs text-muted">{donorGroups.find((g) => g.key === group)?.hint}.</p> : null}

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold text-muted">s18A receipt:</span>
          <Tabs
            label="s18A receipt"
            items={[
              { href: href(1, group, tag, null), label: "Everyone", active: !s18a },
              ...(Object.keys(S18A_FILTERS) as S18aFilter[]).map((f) => ({
                href: href(1, group, tag, s18a === f ? null : f),
                label: S18A_FILTERS[f],
                active: s18a === f,
                // No count when the details check failed: a 0 would wrongly say nobody is missing anything.
                ...(f === "details_missing" && missingRead === null ? {} : { count: counts[f] }),
              })),
            ]}
          />
        </div>
        {s18a ? <p className="text-xs text-muted">{S18A_FILTER_HINTS[s18a]}.</p> : null}
        {missingRead === null ? (
          <p role="status" className="rounded-card bg-warning-soft p-3 text-sm text-warning">We couldn&apos;t check which donors have s18A details missing just now. Nothing has changed. Refresh the page to try again.</p>
        ) : null}

        {tags.length ? (
          <nav aria-label="Tags" className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="mr-1 text-xs font-semibold text-muted">Tags:</span>
            {tags.map((t) => (
              <Link
                key={t.id}
                href={href(1, group, tag === t.id ? null : t.id)}
                aria-current={tag === t.id ? "page" : undefined}
                className={`${pill} [overflow-wrap:anywhere] ${tag === t.id ? "border-brand bg-brand text-white" : "border-border bg-surface text-navy hover:border-brand hover:text-brand focus-visible:border-brand"}`}
              >
                {t.name}
              </Link>
            ))}
          </nav>
        ) : null}

        {segments.length ? (
          <nav aria-label="Saved lists" className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="mr-1 text-xs font-semibold text-muted">Saved lists:</span>
            {segments.map((s) => (
              <Link key={s.id} href={segmentHref(s.filters)} className={`${pill} [overflow-wrap:anywhere] border-honey bg-honey-soft text-indigo hover:border-brand hover:text-brand focus-visible:border-brand`}>{s.name}</Link>
            ))}
          </nav>
        ) : null}

        <LiveFilterForm action={base} className="flex flex-wrap gap-2">
          {group ? <input type="hidden" name="group" value={group} /> : null}
          {tag ? <input type="hidden" name="tag" value={tag} /> : null}
          {s18a ? <input type="hidden" name="s18a" value={s18a} /> : null}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name or email"
            aria-label="Search by donor name or email"
            className={`${field} min-w-0 flex-[1_1_12rem]`}
          />
          <label className="flex min-w-0 flex-[1_1_14rem] items-center gap-2 text-sm font-semibold text-navy">
            <span className="shrink-0">Sort by</span>
            <select key={sort ?? "usual"} name="sort" defaultValue={sort ?? ""} className={`${field} min-w-0 flex-1`}>
              <option value="">Usual order (most given first)</option>
              {Object.entries(DONOR_SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button className={blueAction}>Search</button>
        </LiveFilterForm>
      </div>

      {reminding && shown.length ? (
        canRemind ? (
          <ReminderForm key={key} action={remindS18aDetails.bind(null, id, here)} allIds={reminderIds} charityName={charity.name_en} max={MAX_REMINDERS} />
        ) : (
          <p className="rounded-card bg-honey-soft p-3 text-sm text-navy">
            {!owner ? "Only your charity's owner can send reminders to add s18A details." : "You can send reminders to add s18A details once your page is live."}
          </p>
        )
      ) : null}

      {contacts.length && !s18a ? <p className="text-xs text-muted">Donors you imported are marked &quot;Imported, no gifts yet&quot;. Givezy never emails them.</p> : null}

      {shown.length === 0 ? (
        s18a === "details_missing" && missingRead !== null && !q && !group && !tag ? (
          <EmptyState title="No details missing">
            Every donor who asked for an s18A receipt has added what SARS needs, so there is nobody to remind.
          </EmptyState>
        ) : q || group || tag || s18a ? (
          <Card><p className="text-sm text-muted"><NoMatch what="donors" clearHref={base} /></p></Card>
        ) : (
          <EmptyState title="No donors yet" action={<ActionLink href={`${base}/import`}>Import donors (CSV)</ActionLink>}>
            People appear here once their first donation is paid. You can also import the donor list you already keep.
          </EmptyState>
        )
      ) : (
        <Card>
          {/* Each line opens the donor: the name's link covers the line, the thank-you and the email sit above it. */}
          <ul className="-my-2 divide-y divide-border">
            {shown.map((line) => {
              if (line.kind === "contact") return (
              <li key={`contact-${line.id}`} className="-mx-2 rounded-control px-2 py-3 text-sm">
                <div className="min-w-0">
                  <p dir="auto" className="w-fit max-w-full font-semibold text-indigo [overflow-wrap:anywhere]">{line.name}</p>
                  {line.c.organisation_name && line.name !== line.c.organisation_name ? <p dir="auto" className="text-muted [overflow-wrap:anywhere]">{line.c.organisation_name}</p> : null}
                  {line.c.email ? <p className="w-fit max-w-full break-all text-muted">{line.c.email}</p> : null}
                  {line.c.phone ? <p className="w-fit text-muted">{line.c.phone}</p> : null}
                  {line.c.note ? <p dir="auto" className="mt-1 line-clamp-2 whitespace-pre-line text-navy [overflow-wrap:anywhere]">{line.c.note}</p> : null}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge>Imported, no gifts yet</Badge>
                    {line.c.email && gaveEmails.has(line.c.email) ? <Badge tone="success">Has now given</Badge> : null}
                    {line.c.tag_ids.map((t) => (tagName.has(t) ? <Badge key={t}>{tagName.get(t)}</Badge> : null))}
                  </div>
                </div>
              </li>
              );
              const d = line.d;
              return (
              <li key={d.donor_id} className="relative -mx-2 rounded-control px-2 py-3 text-sm transition hover:bg-honey-soft focus-within:bg-honey-soft">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <DonorPeekLink stretch charityId={id} donorId={d.donor_id} href={`${base}/${d.donor_id}`}>{isErasedEmail(d.email) ? ERASED_DONOR : d.display_name}</DonorPeekLink>
                    {shownEmail(d.email) ? <p className="relative z-10 w-fit max-w-full break-all text-muted">{d.email}</p> : null}
                    {d.phone ? <p className="relative z-10 w-fit text-muted">{d.phone}</p> : null}
                    <p className="mt-1 text-muted">
                      {d.donation_count} {d.donation_count === 1 ? "donation" : "donations"}, last on {formatDate(d.last_paid_at)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {givesMonthly.get(d.donor_id) === "active" ? <Badge tone="success">Gives monthly</Badge> : null}
                      {givesMonthly.get(d.donor_id) === "paused" ? <Badge>Monthly paused</Badge> : null}
                      {d.donor_type !== "individual" ? <Badge>{d.donor_type === "company" ? "Company" : "Trust"}</Badge> : null}
                      {d.wants_18a ? <Badge tone="brand">s18A requested</Badge> : null}
                      {missing.has(d.donor_id) ? <Badge tone="warning">s18A details missing</Badge> : null}
                      {d.is_anonymous ? <Badge>Anonymous publicly</Badge> : null}
                      {(byDonor.get(d.donor_id) ?? []).map((t) => (tagName.has(t) ? <Badge key={t}>{tagName.get(t)}</Badge> : null))}
                    </div>
                  </div>
                  <p className="shrink-0 whitespace-nowrap font-display text-lg font-bold tabular-nums text-indigo">{formatRand(d.total_cents)}</p>
                </div>
                {missing.has(d.donor_id) ? (
                  <p className="mt-1.5 text-navy">Still needed for the s18A receipt: {missingList(missing.get(d.donor_id)!)}.</p>
                ) : null}
                {reminding && reminded.get(d.donor_id) ? <p className="mt-1 text-xs text-muted">Last reminded on {formatDate(reminded.get(d.donor_id)!)}.</p> : null}
                {canRemind && missing.has(d.donor_id) ? <ReminderTick key={`tick-${d.donor_id}-${key}`} donorId={d.donor_id} name={isErasedEmail(d.email) ? ERASED_DONOR : d.display_name || "this donor"} /> : null}
                {canThank && shownEmail(d.email) ? (
                  stopped.has(d.email.trim().toLowerCase()) ? (
                    <p className="mt-2 text-xs text-muted">Asked not to get thank-you emails from charities.</p>
                  ) : (
                    <>
                      {thanked.get(d.donor_id) ? <p className="mt-2 text-xs text-muted">Last thanked personally on {formatDate(thanked.get(d.donor_id)!)}.</p> : null}
                      {thisWeek.has(d.donor_id) ? (
                        <p className="relative z-10 mt-2 text-xs text-muted">
                          <span className="font-semibold text-navy">Messaged this week.</span> {WEEKLY_LIMIT} You can thank them from Monday.
                        </p>
                      ) : (
                        <ThankOneForm key={`${d.donor_id}-${key}`} action={thankOneDonor.bind(null, id, d.donor_id, here)} name={d.display_name || "this donor"} />
                      )}
                    </>
                  )
                ) : null}
              </li>
              );
            })}
          </ul>
        </Card>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          {page > 1 ? <Link href={href(page - 1)} className={secondaryAction}>← Previous</Link> : <span />}
          <span className="text-muted">Page {page} of {pages}</span>
          {page < pages ? <Link href={href(page + 1)} className={secondaryAction}>Next →</Link> : <span />}
        </div>
      ) : null}

      {(group || tag || q) && !s18a ? (
        <Card title="Keep this list">
          <SaveListForm action={saveDonorList.bind(null, id, { ...(group ? { group } : {}), ...(tag ? { tag } : {}), ...(q ? { q } : {}) })} />
          {/* One group or one tag can be emailed straight away; other mixes are saved as a list first. */}
          {(group && !tag && !q) || (tag && !group && !q) ? (
            <div className="mt-4 border-t border-border pt-4">
              <ActionLink href={`/charity-admin/${id}/email-donors?to=${group ? `group:${group}` : `tag:${tag}`}`}>Email these donors</ActionLink>
              {contactsShown ? <p className="mt-2 text-xs text-muted">{contactsShown} imported {contactsShown === 1 ? "donor on this list isn't" : "donors on this list aren't"} emailed: Givezy never emails people you imported.</p> : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      <details className="group/settings rounded-card border-2 border-border bg-surface text-sm">
        <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-card px-5 py-3 font-semibold text-navy transition hover:text-brand focus-visible:text-brand sm:px-6">
          Settings: lapsed donors, tags and saved lists
          <span aria-hidden className="text-brand transition group-open/settings:rotate-180">▾</span>
        </summary>
        <div className="space-y-5 border-t-2 border-border px-5 py-4 sm:px-6">
          <LapsedForm action={saveLapsedPeriod.bind(null, id)} days={lapsedDays} />
          {tags.length ? (
            <div className="space-y-2">
              <h2 className="font-display text-lg font-bold text-indigo">Your tags</h2>
              <ul className="divide-y divide-border">
                {tags.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0 [overflow-wrap:anywhere]">{t.name}</span>
                    <ButtonForm action={deleteCharityTag.bind(null, id, t.id)} label="Delete tag" pending="Deleting…" confirm={`Delete the tag "${t.name}"? It comes off every donor. The donors themselves are not changed.`} confirmLabel="Yes, delete it" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {segments.length ? (
            <div className="space-y-2">
              <h2 className="font-display text-lg font-bold text-indigo">Your saved lists</h2>
              <ul className="divide-y divide-border">
                {segments.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0 [overflow-wrap:anywhere]">{s.name}</span>
                    <ButtonForm action={deleteDonorList.bind(null, id, s.id)} label="Remove list" pending="Removing…" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
