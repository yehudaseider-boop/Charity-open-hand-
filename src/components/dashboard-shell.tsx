import Link from "next/link";
import { CharityNav } from "@/components/charity-nav";
import { initials } from "@/lib/charity/initials";
import { statusLabels, type CharityStatus } from "@/lib/charity/status";

const statusChip = {
  neutral: "bg-surface text-muted border-border",
  warning: "bg-warning-soft text-warning border-warning-soft",
  success: "bg-success-soft text-success border-success-soft",
  danger: "bg-danger-soft text-danger border-danger-soft",
} as const;

/**
 * Every page for one charity: the charity's name and status above the dashboard's pages down the side
 * (a scrolling row on a phone), then a bar with search and a link to the public page, then the page itself.
 * It runs wider than the site's reading column so tables and charts have room. Redrawn 29/10/2026.
 * Kept apart from the layout (which checks who is looking) so it can be drawn with sample figures too.
 */
export function DashboardShell({
  id,
  charity,
  asGivezy,
  base: baseOverride,
  publicHref,
  children,
}: {
  id: string;
  charity: { name_en: string; slug: string; status: string };
  asGivezy: boolean;
  /** Where this dashboard's pages live; the demo uses its own address. */
  base?: string;
  /** The charity's public page; `null` leaves the link out (the demo has none). */
  publicHref?: string | null;
  children: React.ReactNode;
}) {
  const base = baseOverride ?? `/charity-admin/${id}`;
  const publicLink = publicHref === undefined ? (charity.status === "approved" ? `/c/${charity.slug}` : null) : publicHref;
  const status = statusLabels[charity.status as CharityStatus] ?? statusLabels.draft;
  return (
    // full-bleed: the dashboard breaks out of the site's narrow column (see globals.css).
    <div className="full-bleed overflow-x-clip bg-honey-soft/60 print:bg-transparent">
      <div className="mx-auto grid max-w-[90rem] grid-cols-[minmax(0,1fr)] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:gap-8 lg:py-8">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain print:hidden">
          <div className="rounded-card border-2 border-border bg-surface p-4">
            <p className="text-xs font-bold text-muted">Charity dashboard</p>
            <p className="mt-0.5 font-display text-lg font-bold leading-snug text-indigo [overflow-wrap:anywhere]">{charity.name_en}</p>
            <span className={`mt-2 inline-block rounded-full border-2 px-2.5 py-0.5 text-xs font-semibold ${statusChip[status.tone]}`}>{status.label}</span>
          </div>
          <div className="lg:rounded-card lg:border-2 lg:border-border lg:bg-surface lg:p-3">
            <CharityNav id={id} base={base} />
          </div>
        </aside>
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <form action={`${base}/donations`} method="get" role="search" className="relative min-w-0 max-w-xl flex-1 basis-64">
              <label htmlFor="dash-search" className="sr-only">Search donations</label>
              <svg viewBox="0 0 24 24" aria-hidden className="pointer-events-none absolute left-3.5 top-3 h-5 w-5 fill-none stroke-muted" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              <input
                id="dash-search"
                name="q"
                type="search"
                maxLength={60}
                placeholder="Search donations by name or email"
                className="h-11 w-full rounded-control border-2 border-border bg-surface pl-11 pr-3 text-sm text-navy placeholder:text-muted focus:border-brand"
              />
            </form>
            <span className="flex-1" />
            {publicLink ? (
              <Link href={publicLink} className="inline-flex min-h-11 items-center rounded-control border-2 border-border bg-surface px-4 text-sm font-semibold text-brand hover:border-brand">
                See your public page
              </Link>
            ) : null}
            <span role="img" aria-label={charity.name_en} className="grid h-11 w-11 place-items-center rounded-full bg-honey font-display text-sm font-bold text-navy">{initials(charity.name_en)}</span>
          </div>
          {asGivezy ? (
            <p role="note" className="rounded-card border-2 border-honey bg-honey-soft p-4 text-sm text-navy print:hidden">
              You&apos;re looking at {charity.name_en}&apos;s dashboard as Givezy, with the owner&apos;s powers. Anything you save, send or remove here is real.{" "}
              <Link href={`/admin/charities/${id}`} className="font-semibold underline">Back to Givezy admin</Link>
            </p>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
