import type { Metadata } from "next";
import Link from "next/link";
import { NoMatch } from "@/components/no-match";
import { Badge } from "@/components/badge";
import { DonePanel, formKey } from "@/components/done-panel";
import { lastThanked, optedOut } from "@/lib/charity/thank-you-send";
import { thankOneDonor } from "./actions";
import { ThankOneForm } from "./thank-form";
import { requireViewer } from "@/lib/auth";
import { ERASED_DONOR, isErasedEmail, safeSearch, shownEmail } from "@/lib/charity/dashboard";
import { loadDonors, loadMonthlyDonations, loadMonthlyGifts } from "@/lib/charity/dashboard-queries";
import { loadCharityForManager } from "@/lib/charity/queries";
import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { donorGroup, donorGroups, isDonorGroup, monthlyByDonor } from "@/lib/charity/insights";

export const metadata: Metadata = { title: "Donors" };

const PAGE = 25;

export default async function DonorsPage({ params, searchParams }: PageProps<"/charity-admin/[id]/donors">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/donors`);
  const { charity } = await loadCharityForManager(id);
  const sp = await searchParams;
  const q = safeSearch(typeof sp.q === "string" ? sp.q : "");
  const page = Math.max(1, Math.min(10_000, Number(typeof sp.page === "string" ? sp.page : 1) || 1));

  const group = isDonorGroup(sp.group) ? sp.group : null;

  const [all, monthlyGifts, monthly] = await Promise.all([loadDonors(id), loadMonthlyGifts(id), loadMonthlyDonations(id)]);
  const givesMonthly = monthlyByDonor(monthlyGifts, monthly);
  const now = new Date();
  const needle = q.toLowerCase();
  const donors = all.filter(
    (d) => (!group || donorGroup(d, now) === group) && (!needle || d.display_name.toLowerCase().includes(needle) || d.email.toLowerCase().includes(needle)),
  );
  const pages = Math.max(1, Math.ceil(donors.length / PAGE));
  const shown = donors.slice((page - 1) * PAGE, page * PAGE);
  const base = `/charity-admin/${id}/donors`;
  const href = (p: number, g: string | null = group) =>
    `${base}?${new URLSearchParams({ ...(q ? { q } : {}), ...(g ? { group: g } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString()}`.replace(/\?$/, "");
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
        <a href={`/charity-admin/${id}/export/donors`} className="text-sm text-brand underline">Download donors (CSV)</a>
      </div>
      <DonePanel charity={charity} sp={sp} here={base} />
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

      <form action={base} className="flex gap-2">
        {group ? <input type="hidden" name="group" value={group} /> : null}
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name or email"
          aria-label="Search by donor name or email"
          className="min-w-0 flex-1 rounded-control border border-border bg-surface px-3 py-2.5"
        />
        <button className="pressable rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast">Search</button>
      </form>

      {shown.length === 0 ? (
        <p className="text-sm text-muted">{q || group ? <NoMatch what="donors" clearHref={base} /> : "No donors yet. People appear here once their first donation is paid."}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((d) => (
            <li key={d.donor_id} className="rounded-card border border-border bg-surface p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{isErasedEmail(d.email) ? ERASED_DONOR : d.display_name}</p>
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
