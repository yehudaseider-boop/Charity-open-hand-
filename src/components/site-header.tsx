import Link from "next/link";
import { platformConfig } from "@/config/platform";
import { getViewer } from "@/lib/auth";

export async function SiteHeader() {
  const viewer = await getViewer();
  return (
    <header className="bg-surface border-b border-border">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" aria-label={`${platformConfig.appName} home`} className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt={platformConfig.appName} width={168} height={28} className="h-7 w-auto" />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/charities" className="hover:text-brand">Charities</Link>
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
