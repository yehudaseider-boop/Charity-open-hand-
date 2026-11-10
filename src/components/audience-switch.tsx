import Link from "next/link";
import { AUDIENCE_LABELS, AUDIENCE_PATHS, type Audience } from "@/lib/audience";

/**
 * "I give" | "I run a charity" at the top of the home page and For charities (10/11/2026). Plain links, so it works
 * without script and each side is its own cached page; the current side is marked for screen readers.
 */
export function AudienceSwitch({ current }: { current: Audience }) {
  return (
    <nav aria-label="Who is this for" className="inline-flex rounded-full border-[1.5px] border-border bg-white p-1 shadow-[0_6px_20px_rgba(14,27,61,0.06)]">
      {(Object.keys(AUDIENCE_PATHS) as Audience[]).map((a) => {
        const on = a === current;
        return (
          <Link
            key={a}
            href={AUDIENCE_PATHS[a]}
            aria-current={on ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-5 text-[15px] font-bold transition-colors ${on ? "bg-brand text-brand-contrast" : "text-navy hover:bg-honey-soft"}`}
          >
            {AUDIENCE_LABELS[a]}
          </Link>
        );
      })}
    </nav>
  );
}
