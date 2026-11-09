import Link from "next/link";
import { platformConfig } from "@/config/platform";
import { HeaderNav } from "@/components/header-nav";

/**
 * The site header. It reads nothing from the request, so public pages can be built once and served from cache
 * near the visitor (09/11/2026). All three looks are in the page, and globals.css shows the right one:
 * - the full header, with the links filled in by the browser (HeaderNav);
 * - a charity's own link (lib/focus.ts): logo and "Secure giving" only, shown when the page carries
 *   <ChromeMark kind="focus" /> (the /c/[slug] layout and the thank-you page);
 * - the dashboard demo: a closed room with no way off to the rest of Givezy (<ChromeMark kind="demo" />).
 */
export function SiteHeader() {
  return (
    <>
      {/* Stays at the top while the page scrolls, so Charities and Sign in are always one tap away. */}
      <header className="site-header chrome-full sticky top-0 z-40 border-b border-border bg-surface print:hidden">
        <div className="mx-auto flex h-16 max-w-[75rem] items-center justify-between gap-3 px-4 sm:h-[4.5rem] sm:px-6">
          <Link href="/" aria-label={`${platformConfig.appName} home`} className="-ml-1.5 shrink-0 rounded-lg p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt={platformConfig.appName} width={97} height={32} className="h-8 w-auto sm:h-9" />
          </Link>
          <HeaderNav />
        </div>
      </header>

      <header className="chrome-focus border-b border-border bg-surface print:hidden">
        <div className="mx-auto flex h-14 max-w-[75rem] items-center justify-between gap-3 px-4 sm:px-6">
          {/* The one quiet way out to the rest of Givezy (30/10/2026): the logo goes home, which ends the focus. */}
          <Link href="/" aria-label={`${platformConfig.appName} home`} className="-ml-1.5 shrink-0 rounded-lg p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt={platformConfig.appName} width={97} height={32} className="h-7 w-auto" />
          </Link>
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <svg aria-hidden viewBox="0 0 24 24" width="15" height="15" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 stroke-sage">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            Secure giving
          </p>
        </div>
      </header>

      <header className="chrome-demo border-b border-border bg-surface print:hidden">
        <div className="mx-auto flex h-14 max-w-[75rem] items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt={platformConfig.appName} width={97} height={32} className="h-7 w-auto" />
          <p className="rounded-full bg-honey-soft px-3 py-1 text-sm font-semibold text-navy">Charity dashboard demo</p>
        </div>
      </header>
    </>
  );
}
