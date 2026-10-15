import Link from "next/link";
import { platformConfig } from "@/config/platform";
import { getViewer } from "@/lib/auth";

export async function SiteHeader() {
  const viewer = await getViewer();
  return (
    <header className="bg-surface border-b border-border print:hidden">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" aria-label={`${platformConfig.appName} home`} className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt={platformConfig.appName} width={97} height={32} className="h-8 w-auto" />
        </Link>
        <nav className="flex items-center gap-3 whitespace-nowrap text-sm sm:gap-4">
          <Link href="/charities" className="hover:text-brand">Charities</Link>
          {/* Phones: the home page and footer link here instead, so the header stays on one line. */}
          <Link href="/for-charities" className="hidden hover:text-brand sm:inline">For charities</Link>
          {viewer ? (
            <Link href="/account" className="hover:text-brand">Account</Link>
          ) : (
            <Link href="/login" className="rounded-control bg-brand px-3 py-1.5 text-brand-contrast">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
