import type { Metadata } from "next";
import Link from "next/link";
import { CharityNav } from "@/components/charity-nav";
import { Drop } from "@/components/drop";
import { getViewer, requireViewer } from "@/lib/auth";
import { loadCharityForManager } from "@/lib/charity/queries";
import { statusLabels, type CharityStatus } from "@/lib/charity/status";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const statusChip = {
  neutral: "bg-surface text-muted border-border",
  warning: "bg-warning-soft text-warning border-warning-soft",
  success: "bg-success-soft text-success border-success-soft",
  danger: "bg-danger-soft text-danger border-danger-soft",
} as const;

/**
 * Every page for one charity: a calm header band with the charity's name and status, the dashboard's
 * pages down the side (a scrolling row on a phone), and the page itself. It runs wider than the site's
 * reading column so tables and charts have room.
 */
export default async function CharityLayout({ children, params }: LayoutProps<"/charity-admin/[id]">) {
  const { id } = await params;
  // Signed out: the sign-in page, never "not found" (the layout and the page render side by side).
  await requireViewer(`/charity-admin/${id}`);
  const { charity } = await loadCharityForManager(id);
  // Givezy looking at a charity it isn't part of: say so on every page, since what it saves is real.
  const viewer = await getViewer();
  const asGivezy = Boolean(viewer?.isPlatformAdmin && !viewer.managedCharityIds.includes(id));
  const status = statusLabels[charity.status as CharityStatus] ?? statusLabels.draft;
  return (
    // full-bleed: the dashboard breaks out of the site's narrow column (see globals.css).
    <div className="full-bleed overflow-x-clip">
      <header className="relative overflow-hidden border-b-2 border-border bg-honey-soft print:hidden">
        <Drop colour="orange" className="-right-6 -top-10 hidden h-28 w-auto rotate-12 sm:block" />
        <div className="relative mx-auto flex max-w-[75rem] flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 py-6 sm:px-6">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-bold text-brand">Givezy for charities</p>
            <p className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-bold leading-tight text-indigo">{charity.name_en}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:mr-24">
            <span className={`rounded-full border-2 px-3 py-1 text-sm font-semibold ${statusChip[status.tone]}`}>{status.label}</span>
            {charity.status === "approved" ? (
              <Link href={`/c/${charity.slug}`} className="text-sm font-semibold text-brand underline underline-offset-4">
                See your public page
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[75rem] grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-10 lg:py-8">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <CharityNav id={id} />
        </aside>
        <div className="min-w-0 space-y-5">
          {asGivezy ? (
            <p role="note" className="rounded-card border-2 border-honey bg-honey-soft p-4 text-sm text-navy print:hidden">
              You&apos;re looking at {charity.name_en}&apos;s dashboard as Givezy, with the owner&apos;s powers. Anything you save, send or remove here is real.{" "}
              <Link href={`/admin/charities/${id}`} className="font-semibold underline">Back to Admin</Link>
            </p>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
