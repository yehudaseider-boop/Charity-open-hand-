import Link from "next/link";
import { platformConfig } from "@/config/platform";
import { SiteFooter } from "@/components/legal";

/**
 * The site footer, in the same three looks as the header (see site-header.tsx): the full footer; on a charity's
 * own link (lib/focus.ts) a short one with only what a donor needs (card safety, privacy, terms) and no way off to
 * other charities; and one quiet line in the dashboard demo. Reads nothing from the request, so pages can be
 * served from cache; globals.css shows the right one.
 */
export function PageFooter() {
  return (
    <>
      <div className="chrome-full mt-auto">
        <SiteFooter />
      </div>
      <footer className="chrome-demo mt-auto bg-honey-soft print:hidden">
        <p className="mx-auto max-w-[75rem] px-4 py-6 text-[13px] text-muted sm:px-6">
          A demonstration of the {platformConfig.appName} charity dashboard, with made-up donors and figures. © {new Date().getFullYear()} {platformConfig.appName}
        </p>
      </footer>
      <footer className="chrome-focus mt-auto bg-honey-soft print:hidden">
        <div className="mx-auto flex max-w-[75rem] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-[13px] text-muted sm:px-6">
          <p className="flex items-center gap-2">
            <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 stroke-sage">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            Card details are handled by our payment provider. We never see or store them.
          </p>
          <p className="flex flex-wrap gap-x-4">
            <Link href="/privacy" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-brand hover:underline">Privacy Policy</Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-brand hover:underline">Terms</Link>
            <span className="inline-flex min-h-11 items-center">© {new Date().getFullYear()} Givezy</span>
          </p>
        </div>
      </footer>
    </>
  );
}
