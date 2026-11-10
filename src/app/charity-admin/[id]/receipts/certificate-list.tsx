import Link from "next/link";
import { Badge } from "@/components/badge";
import { formatRand } from "@/lib/money";
import { STATUS_WORDS } from "@/lib/receipts/review";
import type { PlanLine } from "@/lib/receipts/runs";

const STATUS_TONE = { to_check: "warning", approved: "success", edited: "success", declined: "danger" } as const;

/**
 * The year's planned receipts: who, how many gifts, how much, and where each one's check stands. Each line opens
 * the receipt's preview. A list rather than a table, so it reads on a phone (375px) without scrolling sideways.
 */
export function CertificateList({ charityId, taxYear, lines, total, toIssue, canOpen = true }: { charityId: string; taxYear: number; lines: PlanLine[]; total?: string; toIssue?: number; canOpen?: boolean }) {
  return (
    <div>
      <ul className="divide-y divide-border border-y border-border">
        {lines.map((l) => (
          <li key={l.key}>
            <Row
              href={canOpen ? `/charity-admin/${charityId}/receipts/certificate?year=${taxYear}&c=${l.key}` : null}
            >
              <span className="min-w-0">
                <span className={`block truncate font-medium ${canOpen ? "text-brand underline" : "text-navy"}`} dir="auto">{l.donorName}</span>
                <span className="block text-xs text-muted">
                  {l.gifts} {l.gifts === 1 ? "donation" : "donations"}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1 text-right">
                <span className="font-semibold tabular-nums text-indigo">{formatRand(l.totalCents)}</span>
                <Badge tone={STATUS_TONE[l.status]}>{STATUS_WORDS[l.status]}</Badge>
                {l.changedSince ? <span className="text-xs text-warning">Changed since</span> : null}
              </span>
            </Row>
          </li>
        ))}
      </ul>
      {total !== undefined && toIssue !== undefined ? (
        <p className="flex justify-between gap-3 pt-2.5 font-bold text-indigo">
          <span>{toIssue} {toIssue === 1 ? "receipt" : "receipts"} to issue</span>
          <span className="tabular-nums">{total}</span>
        </p>
      ) : null}
    </div>
  );
}

/** A line that opens the receipt's preview, or (for a role that can't check receipts) the same line without a link. */
function Row({ href, children }: { href: string | null; children: React.ReactNode }) {
  const cls = "group -mx-2 flex items-start justify-between gap-3 rounded-control px-2 py-3";
  if (!href) return <div className={cls}>{children}</div>;
  return (
    <Link href={href} className={`${cls} transition hover:bg-honey-soft focus-visible:bg-honey-soft`}>
      {children}
    </Link>
  );
}
