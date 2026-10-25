import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin-nav";
import { Splash } from "@/components/splash";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Every Givezy admin page: the same calm frame as a charity's dashboard (a pale header band, the pages down
 * the side, a scrolling row on a phone), so the two feel like one product. It runs wider than the site's
 * reading column so tables have room.
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="full-bleed overflow-x-clip">
      <header className="relative overflow-hidden border-b-2 border-border bg-honey-soft print:hidden">
        {/* The logo's splash, whole, in the space kept free beside the badges (laptops only). */}
        <Splash className="absolute right-[max(1.5rem,calc(50%-36rem))] top-1/2 hidden h-auto w-20 -translate-y-1/2 sm:block" />
        <div className="relative mx-auto flex max-w-[75rem] flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 py-6 sm:px-6">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-bold text-brand">Givezy</p>
            <p className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-bold leading-tight text-indigo">Platform admin</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:mr-24">
            <span className="rounded-full border-2 border-border bg-surface px-3 py-1 text-sm font-semibold text-navy">Givezy staff only</span>
            <Link href="/" className="text-sm font-semibold text-brand underline underline-offset-4">See the public site</Link>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[75rem] grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-10 lg:py-8">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <AdminNav />
        </aside>
        <div className="min-w-0 space-y-5">{children}</div>
      </div>
    </div>
  );
}
