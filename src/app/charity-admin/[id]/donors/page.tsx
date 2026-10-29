import type { Metadata } from "next";
import Link from "next/link";
import { LiveFilterForm } from "@/components/forms/live-filter-form";
import { NoMatch } from "@/components/no-match";
import { Badge } from "@/components/badge";
import { DonePanel, formKey } from "@/components/done-panel";
import { lastThanked, optedOut } from "@/lib/charity/thank-you-send";
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

export const metadata: Metadata = { title: "Donors" };

const PAGE = 25;

export default async function DonorsPage({ params, searchParams }: PageProps<"/charity-admin/[id]/donors">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/donors`);
  const { charity } = await loadCharityForManager(id);
  const sp = await searchParams;
  const q = safeSearch(typeof sp.q === "string" ? sp.q : "");
  const asked = Math.max(1, Math.min(10_000, Number(typeof sp.page === "string" ? sp.page : 1) || 1));

  const group = isDonorGroup(sp.group) ? sp.group : null;

  const [all, monthlyGifts, monthly, tags, byDonor, segments, lapsedDays] = await Promise.all([
    loadDonors(id), loadMonthlyGifts(id), loadMonthlyDonations(id), listTags(id), tagsByDonor(id), listSegments(id), lapsedDaysFor(id),
  ]);
  const donorGroups = donorGroupsFor(lapsedDays);
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const tag = typeof sp.tag === "string" && tagName.has(sp.tag) ? sp.tag : null;
  const givesMonthly = monthlyByDonor(monthlyGifts, monthly);
  const now = new Date();
  const needle = q.toLowerCase();
  const donors = all.filter(
    (d) =>
      (!group || donorGroup(d, now, lapsedDays) === group) &&
      (!tag || (byDonor.get(d.donor_id) ?? []).includes(tag)) &&
      (!needle || d.display_name.toLowerCase().includes(needle) || d.email.toLowerCase().includes(needle)),
  );
  const pages = Math.max(1, Math.ceil(donors.length / PAGE));
  // A page past the end (an old link, a typed number) shows the last page, never "No donors yet".
  const page = Math.min(asked, pages);
  const shown = donors.slice((page - 1) * PAGE, page * PAGE);
  const base = `/charity-admin/${id}/donors`;
  const href = (p: number, g: string | null = group, t: string | null = tag) =>
    `${base}?${new URLSearchParams({ ...(q ? { q } : {}), ...(g ? { group: g } : {}), ...(t ? { tag: t } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString()}`.replace(/\?$/, "");
  const segmentHref = (f: { group?: string; tag?: string; q?: string }) =>
    `${base}?${new URLSearchParams({ ...(f.q ? { q: f.q } : {}), ...(f.group ? { group: f.group } : {}), ...(f.tag ? { tag: f.tag } : {}) }).toString()}`.replace(/\?$/, "");
  // "Say thank you": only once the page is live, never to erased donors or anyone who asked not to get them.
  const canThank = charity.status === "approved";
  const [thanked, stopped] = canThank
    ? await Promise.all([lastThanked(id, shown.map((d) => d.donor_id)), optedOut(shown.filter((d) => shownEmail(d.email)).map((d) => d.email))])
    : [new Map<string, string>(), new Set<string>()];
  const here = href(page);
  const key = formKey(sp);

  const pill = "inline-flex min-h-9 items-center rounded-full border-2 px-3.5 text-sm font-semibold transition";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Donors"
        intro="People who have given to your charity. Anonymous donors are anonymous on public pages only: you see their details because you need them to record donations. Where a donor asked for one, Givezy issues the s18A receipt in your name."
        actions={
          <>
            <ActionLink download href={`/charity-admin/${id}/export/donors`}>Download donors (CSV)</ActionLink>
            <ActionLink download href={`/charity-admin/${id}/export/donors?format=xlsx`}>Excel</ActionLink>
            <ActionLink download href={`/charity-admin/${id}/export/donors?format=salesforce`}>For Salesforce</ActionLink>
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

        <LiveFilterForm action={base} className="flex gap-2">
          {group ? <input type="hidden" name="group" value={group} /> : null}
          {tag ? <input type="hidden" name="tag" value={tag} /> : null}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name or email"
            aria-label="Search by donor name or email"
            className={`${field} min-w-0 flex-1`}
          />
          <button className={blueAction}>Search</button>
        </LiveFilterForm>
      </div>

      {shown.length === 0 ? (
        q || group || tag ? (
          <Card><p className="text-sm text-muted"><NoMatch what="donors" clearHref={base} /></p></Card>
        ) : (
          <EmptyState title="No donors yet">People appear here once their first donation is paid.</EmptyState>
        )
      ) : (
        <Card>
          {/* Each line opens the donor: the name's link covers the line, the thank-you and the email sit above it. */}
          <ul className="-my-2 divide-y divide-border">
            {shown.map((d) => (
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
                      {d.is_anonymous ? <Badge>Anonymous publicly</Badge> : null}
                      {(byDonor.get(d.donor_id) ?? []).map((t) => (tagName.has(t) ? <Badge key={t}>{tagName.get(t)}</Badge> : null))}
                    </div>
                  </div>
                  <p className="shrink-0 whitespace-nowrap font-display text-lg font-bold tabular-nums text-indigo">{formatRand(d.total_cents)}</p>
                </div>
                {canThank && shownEmail(d.email) ? (
                  stopped.has(d.email.trim().toLowerCase()) ? (
                    <p className="mt-2 text-xs text-muted">Asked not to get thank-you emails from charities.</p>
                  ) : (
                    <>
                      {thanked.get(d.donor_id) ? <p className="mt-2 text-xs text-muted">Last thanked personally on {formatDate(thanked.get(d.donor_id)!)}.</p> : null}
                      <ThankOneForm key={`${d.donor_id}-${key}`} action={thankOneDonor.bind(null, id, d.donor_id, here)} name={d.display_name || "this donor"} />
                    </>
                  )
                ) : null}
              </li>
            ))}
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

      {group || tag || q ? (
        <Card title="Keep this list">
          <SaveListForm action={saveDonorList.bind(null, id, { ...(group ? { group } : {}), ...(tag ? { tag } : {}), ...(q ? { q } : {}) })} />
          {/* One group or one tag can be emailed straight away; other mixes are saved as a list first. */}
          {(group && !tag && !q) || (tag && !group && !q) ? (
            <div className="mt-4 border-t border-border pt-4">
              <ActionLink href={`/charity-admin/${id}/email-donors?to=${group ? `group:${group}` : `tag:${tag}`}`}>Email these donors</ActionLink>
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
