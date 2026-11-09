import Link from "next/link";
import { platformConfig } from "@/config/platform";
import { SiteFooter } from "@/components/legal";
import { currentFocus } from "@/lib/focus-server";
import { headers } from "next/headers";
import { CURRENT_PATH_HEADER } from "@/lib/current-path";
import { isDemoPath } from "@/lib/demo-path";

/**
 * The site footer, or on a charity's own link (see lib/focus.ts) a short one: only what a donor
 * needs (card safety, privacy, terms), with no way off to other charities. Kept apart from
 * legal.tsx because pages in the browser use that file too, and this one reads the request.
 */
export async function PageFooter() {
  // The dashboard demo: one quiet line, no links out (see lib/demo-path.ts).
  if (isDemoPath((await headers()).get(CURRENT_PATH_HEADER))) {
    return (
      <footer className="mt-auto bg-honey-soft print:hidden">
        <p className="mx-auto max-w-[75rem] px-4 py-6 text-[13px] text-muted sm:px-6">
          A demonstration of the {platformConfig.appName} charity dashboard, with made-up donors and figures. © {new Date().getFullYear()} {platformConfig.appName}
        </p>
      </footer>
    );
  }
  if (!(await currentFocus())) return <SiteFooter />;
  return (
    <footer className="mt-auto bg-honey-soft print:hidden">
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
  );
}
