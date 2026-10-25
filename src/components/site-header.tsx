import Link from "next/link";
import { platformConfig } from "@/config/platform";
import { getViewer } from "@/lib/auth";
import { dashboardLink } from "@/lib/dashboard-link";
import { NavLink } from "@/components/nav-link";

export async function SiteHeader() {
  const viewer = await getViewer();
  const dashboard = dashboardLink(viewer);
  return (
    // Stays at the top while the page scrolls, so Charities and Sign in are always one tap away.
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-md print:hidden">
      <div className="mx-auto flex h-16 max-w-[75rem] items-center justify-between gap-3 px-4 sm:h-[4.5rem] sm:px-6">
        <Link href="/" aria-label={`${platformConfig.appName} home`} className="-ml-1.5 shrink-0 rounded-lg p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt={platformConfig.appName} width={97} height={32} className="h-8 w-auto sm:h-9" />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 whitespace-nowrap text-[15px] sm:gap-2">
          {/* On a phone a charity admin sees Dashboard instead of Charities, so the header stays on one line. */}
          <NavLink href="/charities" className={dashboard ? "max-sm:hidden" : ""}>Charities</NavLink>
          {/* Phones: the home page and footer link here instead, so the header stays on one line. */}
          <NavLink href="/for-charities" className="max-sm:hidden">For charities</NavLink>
          {/* A charity admin can always get back to their dashboard from any public page. */}
          {dashboard ? <NavLink href={dashboard.href}>{dashboard.label}</NavLink> : null}
          {viewer ? (
            <NavLink href="/account">Account</NavLink>
          ) : (
            <Link href="/login" className="ml-1 inline-flex min-h-11 items-center rounded-full bg-brand px-4 font-semibold text-brand-contrast transition-colors hover:bg-navy">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
