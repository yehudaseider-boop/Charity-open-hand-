import { Badge } from "@/components/badge";
import { charityBadges, type BadgeFields } from "@/lib/charities";

/**
 * s18A status as two badges of the same shape and size, so neither reads as a
 * warning: a sage outline and tick for "s18A receipts", a stone outline and
 * dash for "No s18A receipt". Both have ink text.
 */
function ReceiptBadge({ yes }: { yes: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] bg-surface px-2.5 py-0.5 text-xs font-medium text-text ${yes ? "border-sage" : "border-muted"}`}
    >
      <svg aria-hidden viewBox="0 0 24 24" width="14" height="14" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={yes ? "stroke-sage" : "stroke-muted"}>
        {yes ? <path d="M5 12.5l4.2 4.2L19 7" /> : <path d="M6 12h12" />}
      </svg>
      {yes ? "s18A receipts" : "No s18A receipt"}
    </span>
  );
}

export function CharityBadges({ charity }: { charity: BadgeFields }) {
  const b = charityBadges(charity);
  return (
    <>
      {b.verified ? <Badge tone="brand">Verified</Badge> : null}
      <ReceiptBadge yes={b.s18a} />
    </>
  );
}
