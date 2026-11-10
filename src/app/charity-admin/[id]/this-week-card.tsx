import Link from "next/link";
import { Card } from "@/components/card";
import { listInWords, type WeekItem } from "@/lib/charity/this-week";

/**
 * "Needs you this week" (CRM step 17, 10/11/2026), near the top of the overview: each line says what needs a person
 * and has one button to the page where it is done. If part of it couldn't be checked, the rest still shows and the
 * card says which part, with Try again (a fresh load of the overview).
 */
export function ThisWeekCard({ items, unavailable = [], base }: { items: WeekItem[]; unavailable?: string[]; base: string }) {
  return (
    <Card lights title="Needs you this week">
      {items.length ? (
        <ul className="divide-y divide-border text-sm">
          {items.map((t) => (
            <li key={t.key} className="py-1 first:pt-0 last:pb-0">
              <Link href={t.href} className="group -mx-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-control px-2 py-1.5 transition hover:bg-honey-soft focus-visible:bg-honey-soft">
                <span dir="auto" className="min-w-0 text-navy">{t.text}</span>
                <span className="shrink-0 font-semibold text-brand underline group-hover:no-underline">{t.link} <span aria-hidden className="inline-block transition-transform motion-safe:group-hover:translate-x-1">→</span></span>
              </Link>
            </li>
          ))}
        </ul>
      ) : unavailable.length ? null : (
        <p className="text-sm text-muted">
          <span className="font-semibold text-navy">Nothing needs you this week.</span> New donors to thank, declined or stopped monthly donations,
          missing s18A details and campaigns about to end show up here.
        </p>
      )}
      {unavailable.length ? (
        <p role="status" className={`text-sm text-muted ${items.length ? "mt-3 border-t border-border pt-3" : ""}`}>
          We couldn&apos;t check {listInWords(unavailable)} just now. Nothing was changed.{" "}
          <Link href={base} prefetch={false} className="font-semibold text-brand underline">Try again</Link>
        </p>
      ) : null}
    </Card>
  );
}
