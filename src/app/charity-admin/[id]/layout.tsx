import type { Metadata } from "next";
import { CharityNav } from "@/components/charity-nav";
import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { loadCharityForManager } from "@/lib/charity/queries";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Every charity page sits under a blue colour-block header with the charity's name and the tabs.
 * The dashboard breaks out of the site's narrow reading column so tables and charts have room.
 */
export default async function CharityLayout({ children, params }: LayoutProps<"/charity-admin/[id]">) {
  const { id } = await params;
  const { charity } = await loadCharityForManager(id);
  // Givezy looking at a charity it isn't part of: say so on every page, since what it saves is real.
  const viewer = await getViewer();
  const asGivezy = Boolean(viewer?.isPlatformAdmin && !viewer.managedCharityIds.includes(id));
  return (
    <div className="relative left-1/2 w-[min(72rem,calc(100vw-2rem))] -translate-x-1/2">
      <header className="relative mb-6 overflow-hidden rounded-card bg-brand px-5 pb-4 pt-6 text-white print:hidden sm:px-8">
        <span aria-hidden className="blob absolute hidden sm:block -right-10 -top-14 h-40 w-40 bg-coral" />
        <span aria-hidden className="blob absolute hidden sm:block -top-14 right-36 h-24 w-28 rotate-12 bg-honey" />
        <div className="relative">
          <p className="text-sm font-semibold text-honey">Givezy for charities</p>
          <p className="font-display text-3xl leading-tight sm:text-4xl">{charity.name_en}</p>
          <CharityNav id={id} />
        </div>
      </header>
      {asGivezy ? (
        <p role="note" className="mb-4 rounded-card border-[1.5px] border-honey bg-honey-soft p-3 text-sm text-navy print:hidden">
          You&apos;re looking at {charity.name_en}&apos;s dashboard as Givezy, with the owner&apos;s powers. Anything you save, send or remove here is real.{" "}
          <Link href={`/admin/charities/${id}`} className="font-semibold underline">Back to Admin</Link>
        </p>
      ) : null}
      {children}
    </div>
  );
}
