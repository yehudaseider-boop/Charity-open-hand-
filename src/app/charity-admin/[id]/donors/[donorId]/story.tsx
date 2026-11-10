import Link from "next/link";
import { Badge } from "@/components/badge";
import { Card } from "@/components/card";
import { buildDonorStory, STORY_FIRST, STORY_MAX, type StoryEntry } from "@/lib/charity/donor-story";
import { loadDonorStory } from "@/lib/charity/donor-story-store";
import { formatDate } from "@/lib/dates";

const TONE = { good: "success", neutral: "neutral", warning: "warning" } as const;

/**
 * "Their story with you": every gift, monthly donation, message, s18A receipt and note, newest first (CRM step 18).
 * Read on the server after the page's manager check; a failure here leaves the rest of the donor's page working.
 */
export async function DonorStory(props: { charityId: string; donorId: string; erased: boolean; showAll: boolean; notes: { created_at: string; author: string | null }[] }) {
  const base = `/charity-admin/${props.charityId}`;
  let entries: StoryEntry[];
  try {
    entries = buildDonorStory(await loadDonorStory(props.charityId, props.donorId, props.notes), { base, erased: props.erased });
  } catch (e) {
    console.error("[donor story] could not load", e instanceof Error ? e.message : e);
    return (
      <Card title="Their story with you">
        <p role="alert" className="text-sm text-muted">
          We couldn&apos;t load their history just now. Nothing has changed, and the rest of this page is up to date. Please refresh the page in a moment.
        </p>
      </Card>
    );
  }
  const shown = entries.slice(0, props.showAll ? STORY_MAX : STORY_FIRST);
  const here = `${base}/donors/${props.donorId}`;
  return (
    <Card title="Their story with you">
      {shown.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet. Gifts, messages you send them and s18A receipts will show here.</p>
      ) : (
        <ol className="space-y-0 text-sm" aria-label="Newest first">
          {shown.map((e, i) => (
            <li key={`${e.at}-${e.kind}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border py-2 last:border-b-0">
              <span className="min-w-0 flex-1 basis-56">
                {e.href ? (
                  <Link href={e.href} className="font-medium text-indigo hover:text-brand hover:underline [overflow-wrap:anywhere]" dir="auto">
                    {e.what}
                  </Link>
                ) : (
                  <span className="font-medium [overflow-wrap:anywhere]" dir="auto">{e.what}</span>
                )}
                {e.status ? (
                  <span className="ml-2 align-middle">
                    <Badge tone={TONE[e.tone]}>{e.status}</Badge>
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 whitespace-nowrap tabular-nums text-muted">{formatDate(e.at)}</span>
            </li>
          ))}
        </ol>
      )}
      {!props.showAll && entries.length > STORY_FIRST ? (
        <p className="mt-3 text-sm">
          <Link href={`${here}?story=all#story`} className="font-semibold text-brand underline" scroll={false}>
            Show older ({Math.min(entries.length, STORY_MAX) - STORY_FIRST} more)
          </Link>
        </p>
      ) : null}
      {props.showAll && entries.length > STORY_MAX ? <p className="mt-3 text-xs text-muted">The latest {STORY_MAX} things. Older gifts are on Donations.</p> : null}
      {props.erased ? <p className="mt-3 text-xs text-muted">They asked us to erase their information, so only gifts, monthly donations and s18A receipts are shown.</p> : null}
    </Card>
  );
}

/** While the story loads, the rest of the page is already there. */
export function DonorStoryLoading() {
  return (
    <Card title="Their story with you">
      <p role="status" className="text-sm text-muted">Loading their history…</p>
    </Card>
  );
}
