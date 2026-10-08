import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { donorName, loadCampaignOptions, loadDonations, PAGE_SIZE, requireCharityDashboard } from "@/lib/charity/dashboard";
import {
  cleanDonorSearch,
  donationFiltersQuery,
  donationStatuses,
  parseDonationFilters,
  searchCookieName,
  statusFilters,
} from "@/lib/charity/donation-filters";
import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { DashboardNav } from "../dashboard-nav";
import { applyDonationFilters } from "./actions";

export const metadata: Metadata = { title: "Donations" };

const selectClass = "w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm";

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}

export default async function DonationsPage({ params, searchParams }: PageProps<"/charity-admin/[id]/donations">) {
  const { id } = await params;
  const path = `/charity-admin/${id}/donations`;
  const { charity } = await requireCharityDashboard(id, path);
  const filters = parseDonationFilters(await searchParams);
  const search = cleanDonorSearch((await cookies()).get(searchCookieName(id))?.value);

  const [{ rows, total }, campaigns] = await Promise.all([loadDonations(id, filters, search), loadCampaignOptions(id)]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(search || donationFiltersQuery({ ...filters, page: 1 }));

  return (
    <div className="space-y-4">
      <DashboardNav charity={charity} current="donations" />

      <form action={applyDonationFilters.bind(null, id)} className="space-y-3 rounded-card border border-border bg-surface p-4">
        <Field label="Donor name or email" htmlFor="search">
          <input id="search" name="search" type="search" defaultValue={search} autoComplete="off" className={selectClass} />
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Status" htmlFor="status">
            <select id="status" name="status" defaultValue={filters.status ?? ""} className={selectClass}>
              <option value="">Any</option>
              {Object.entries(statusFilters).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="18A receipt" htmlFor="18a">
            <select id="18a" name="18a" defaultValue={filters.wants18a === undefined ? "" : filters.wants18a ? "yes" : "no"} className={selectClass}>
              <option value="">Any</option>
              <option value="yes">Asked for one</option>
              <option value="no">Didn&apos;t ask</option>
            </select>
          </Field>
          {campaigns.length > 0 ? (
            <Field label="Campaign" htmlFor="campaign">
              <select id="campaign" name="campaign" defaultValue={filters.campaign ?? ""} className={selectClass}>
                <option value="">Any</option>
                <option value="none">No campaign</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </Field>
          ) : null}
          <Field label="From" htmlFor="from">
            <input id="from" name="from" type="date" defaultValue={filters.fromDate} className={selectClass} />
          </Field>
          <Field label="To" htmlFor="to">
            <input id="to" name="to" type="date" defaultValue={filters.toDate} className={selectClass} />
          </Field>
        </div>
        <button className="rounded-control bg-brand px-4 py-2.5 text-sm font-medium text-brand-contrast">Show donations</button>
      </form>
      {filtered ? (
        <form action={applyDonationFilters.bind(null, id)} className="-mt-2">
          <input type="hidden" name="clear_search" value="1" />
          <button className="text-sm text-muted underline">Clear search and filters</button>
        </form>
      ) : null}

      <p className="text-sm text-muted" role="status">
        {total === 0 ? "No donations found." : `${total} ${total === 1 ? "donation" : "donations"}${filtered ? " match" : ""}.`}
        {" "}Amounts are the donation itself, without the processing fee.
      </p>

      {rows.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {rows.map((d) => {
            const status = donationStatuses[d.status];
            const reversed = d.status === "refunded" || d.status === "charged_back";
            return (
              <li key={d.id}>
                <Link href={`${path}/${d.id}`} className="flex items-start justify-between gap-3 p-4 hover:bg-bg">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{donorName(d)}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDate(d.donation_date)}
                      {d.campaign_title ? ` · ${d.campaign_title}` : ""}
                      {d.recurring_id ? " · Monthly" : ""}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {d.status !== "paid" ? <Badge tone={status.tone}>{status.label}</Badge> : null}
                      {d.wants_18a ? <Badge tone="brand">18A</Badge> : null}
                      {d.is_anonymous ? <Badge>Anonymous</Badge> : null}
                    </div>
                  </div>
                  <p className={`shrink-0 font-semibold tabular-nums ${reversed ? "text-danger line-through" : ""}`}>
                    {formatRand(d.amount_cents)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      {pages > 1 ? (
        <nav className="flex items-center justify-between text-sm" aria-label="Pages">
          {filters.page > 1 ? <Link href={`${path}${donationFiltersQuery(filters, filters.page - 1)}`} className="text-brand underline">← Newer</Link> : <span />}
          <span className="text-muted">Page {filters.page} of {pages}</span>
          {filters.page < pages ? <Link href={`${path}${donationFiltersQuery(filters, filters.page + 1)}`} className="text-brand underline">Older →</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
