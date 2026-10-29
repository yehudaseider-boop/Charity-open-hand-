import Link from "next/link";
import { platformConfig } from "@/config/platform";
import { getViewer } from "@/lib/auth";
import { dashboardLinks } from "@/lib/dashboard-link";
import { NavLink } from "@/components/nav-link";
import { currentFocus } from "@/lib/focus-server";

export async function SiteHeader() {
  // Arrived from a charity's own link: only that charity, so no way off to other charities from here.
  if (await currentFocus()) {
    return (
      <header className="border-b border-border bg-surface print:hidden">
        <div className="mx-auto flex h-14 max-w-[75rem] items-center justify-between gap-3 px-4 sm:px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt={platformConfig.appName} width={97} height={32} className="h-7 w-auto" />
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <svg aria-hidden viewBox="0 0 24 24" width="15" height="15" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 stroke-sage">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            Secure giving
          </p>
        </div>
      </header>
    );
  }
  const viewer = await getViewer();
  const dashboards = dashboardLinks(viewer);
  return (
    // Stays at the top while the page scrolls, so Charities and Sign in are always one tap away.
    <header className="site-header sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-md print:hidden">
      <div className="mx-auto flex h-16 max-w-[75rem] items-center justify-between gap-3 px-4 sm:h-[4.5rem] sm:px-6">
        <Link href="/" aria-label={`${platformConfig.appName} home`} className="-ml-1.5 shrink-0 rounded-lg p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt={platformConfig.appName} width={97} height={32} className="h-8 w-auto sm:h-9" />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 whitespace-nowrap text-[15px] sm:gap-2">
          {/* On a phone someone with a work area sees it instead of Charities, so the header stays on one line. */}
          <NavLink href="/charities" className={dashboards.length ? "max-sm:hidden" : ""}>Charities</NavLink>
          {/* Phones: the home page and footer link here instead, so the header stays on one line. */}
          <NavLink href="/for-charities" className="max-sm:hidden">For charities</NavLink>
          {/* A charity admin or Givezy staff can always get back to their area from any public page. */}
          {dashboards.map((d) => (
            <NavLink key={d.href} href={d.href}>
              <span className="sm:hidden">{d.short}</span>
              <span className="max-sm:hidden">{d.label}</span>
            </NavLink>
          ))}
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
