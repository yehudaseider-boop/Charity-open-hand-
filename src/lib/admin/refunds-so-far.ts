import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";

/** One part refund already recorded on a gift (a donation_refunds row). */
export type RecordedRefund = {
  donation_id: string;
  amount_cents: number;
  source: string;
  created_at: string;
};

/**
 * The part refunds already recorded on each gift, oldest first, in words for Admin, Payments: what came off, who told
 * us (the payment provider or a person here) and when. Shown next to the record form so a person can compare with the
 * provider before typing a refund in (26/11/2026: the same refund recorded both ways came off the gift twice).
 */
export function refundsSoFar(
  rows: readonly RecordedRefund[],
): Map<string, string[]> {
  const byGift = new Map<string, string[]>();
  const sorted = [...rows].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  for (const r of sorted) {
    const who = r.source.startsWith("gateway_event:")
      ? "the payment provider told us"
      : r.source.startsWith("admin:")
        ? "recorded here by hand"
        : "recorded";
    const line = `${formatRand(Number(r.amount_cents))} · ${who} · ${formatDate(r.created_at)}`;
    byGift.set(r.donation_id, [...(byGift.get(r.donation_id) ?? []), line]);
  }
  return byGift;
}
