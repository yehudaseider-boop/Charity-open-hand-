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

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display text-2xl text-indigo">Donors</h1>
        <span className="space-x-3 text-sm">
          <a href={`/charity-admin/${id}/export/donors`} className="text-brand underline">Download donors (CSV)</a>
          <a href={`/charity-admin/${id}/export/donors?format=xlsx`} className="text-brand underline">Excel</a>
          <a href={`/charity-admin/${id}/export/donors?format=salesforce`} className="text-brand underline">For Salesforce</a>
        </span>
      </div>
      <DonePanel charity={charity} sp={sp} here={base} />
      {typeof sp.did === "string" && CARE_DONE[sp.did] ? (
        <p role="status" className="rounded-card bg-success-soft p-3 text-sm text-success">{CARE_DONE[sp.did]}</p>
      ) : null}
      <p className="text-sm text-muted">
        People who have given to your charity. Anonymous donors are anonymous on public pages only: you see their details because you need them to record donations. Where a donor asked for one, Givezy issues the s18A receipt in your name.
      </p>

      <nav aria-label="Donor groups" className="flex flex-wrap gap-2 text-sm">
        {[{ key: null, label: "All" }, ...donorGroups].map((g) => (
          <Link
            key={g.key ?? "all"}
            href={href(1, g.key)}
            aria-current={group === g.key ? "page" : undefined}
            className={`rounded-full border px-3.5 py-1.5 font-medium ${group === g.key ? "border-brand bg-brand text-brand-contrast" : "border-border bg-surface text-brand hover:bg-brand-soft"}`}
          >
            {g.label}
          </Link>
        ))}
      </nav>
      {group ? <p className="text-xs text-muted">{donorGroups.find((g) => g.key === group)?.hint}.</p> : null}

      {tags.length ? (
        <nav aria-label="Tags" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-muted">Tags:</span>
          {tags.map((t) => (
            <Link
              key={t.id}
              href={href(1, group, tag === t.id ? null : t.id)}
              aria-current={tag === t.id ? "page" : undefined}
              className={`rounded-full border px-3 py-1 ${tag === t.id ? "border-brand bg-brand text-brand-contrast" : "border-border bg-surface text-navy"}`}
            >
              {t.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {segments.length ? (
        <nav aria-label="Saved lists" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-muted">Saved lists:</span>
          {segments.map((s) => (
            <Link key={s.id} href={segmentHref(s.filters)} className="rounded-full border border-lilac bg-brand-soft px-3 py-1 text-indigo">{s.name}</Link>
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
          className="min-w-0 flex-1 rounded-control border border-border bg-surface px-3 py-2.5"
        />
        <button className="pressable rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast">Search</button>
      </LiveFilterForm>

      {shown.length === 0 ? (
        <p className="text-sm text-muted">{q || group || tag ? <NoMatch what="donors" clearHref={base} /> : "No donors yet. People appear here once their first donation is paid."}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((d) => (
            <li key={d.donor_id} className="rounded-card border border-border bg-surface p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <DonorPeekLink charityId={id} donorId={d.donor_id} href={`${base}/${d.donor_id}`}>{isErasedEmail(d.email) ? ERASED_DONOR : d.display_name}</DonorPeekLink>
                  {shownEmail(d.email) ? <p className="break-all text-muted">{d.email}</p> : null}
                  {d.phone ? <p className="text-muted">{d.phone}</p> : null}
                  <p className="mt-1 text-muted">
                    {d.donation_count} {d.donation_count === 1 ? "donation" : "donations"}, last on {formatDate(d.last_paid_at)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {givesMonthly.get(d.donor_id) === "active" ? <Badge tone="success">Gives monthly</Badge> : null}
                    {givesMonthly.get(d.donor_id) === "paused" ? <Badge>Monthly paused</Badge> : null}
                    {d.donor_type !== "individual" ? <Badge>{d.donor_type === "company" ? "Company" : "Trust"}</Badge> : null}
                    {d.wants_18a ? <Badge tone="brand">s18A requested</Badge> : null}
                    {d.is_anonymous ? <Badge>Anonymous publicly</Badge> : null}
                    {(byDonor.get(d.donor_id) ?? []).map((t) => (tagName.has(t) ? <Badge key={t}>{tagName.get(t)}</Badge> : null))}
                  </div>
                </div>
                <p className="shrink-0 font-semibold">{formatRand(d.total_cents)}</p>
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
      )}

      {group || tag || q ? (
        <Card title="Keep this list">
          <SaveListForm action={saveDonorList.bind(null, id, { ...(group ? { group } : {}), ...(tag ? { tag } : {}), ...(q ? { q } : {}) })} />
          {/* One group or one tag can be emailed straight away; other mixes are saved as a list first. */}
          {(group && !tag && !q) || (tag && !group && !q) ? (
            <Link href={`/charity-admin/${id}/email-donors?to=${group ? `group:${group}` : `tag:${tag}`}`} className="mt-3 inline-block text-sm text-brand underline">Email these donors</Link>
          ) : null}
        </Card>
      ) : null}

      <details className="rounded-card border border-border bg-surface p-4 text-sm">
        <summary className="cursor-pointer font-medium text-navy">Settings: lapsed donors, tags and saved lists</summary>
        <div className="mt-3 space-y-4">
          <LapsedForm action={saveLapsedPeriod.bind(null, id)} days={lapsedDays} />
          {tags.length ? (
            <div className="space-y-2">
              <p className="font-medium">Your tags</p>
              <ul className="space-y-2">
                {tags.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{t.name}</span>
                    <ButtonForm action={deleteCharityTag.bind(null, id, t.id)} label="Delete tag" pending="Deleting…" confirm={`Delete the tag "${t.name}"? It comes off every donor. The donors themselves are not changed.`} confirmLabel="Yes, delete it" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {segments.length ? (
            <div className="space-y-2">
              <p className="font-medium">Your saved lists</p>
              <ul className="space-y-2">
                {segments.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{s.name}</span>
                    <ButtonForm action={deleteDonorList.bind(null, id, s.id)} label="Remove list" pending="Removing…" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </details>

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href(page - 1)} className="text-brand underline">← Previous</Link> : <span />}
          <span className="text-muted">Page {page} of {pages}</span>
          {page < pages ? <Link href={href(page + 1)} className="text-brand underline">Next →</Link> : <span />}
        </div>
      ) : null}
    </div>
  );
}
