import "server-only";
import { carryOnState } from "./carry-on-sends";
import { thankYouRecipients } from "./thank-you-send";

export type SentThankYou = { id: unknown; period_month: unknown; sent_at: unknown; sent_by: unknown; recipient_count: unknown; finished_at: unknown };

/**
 * What the Thank donors page counts, all read side by side (24/11/2026, speed audit: the page took 4.5 s at p95).
 * Before, the unfinished months were counted (and each one's carry-on rule read) one after the other, and only then
 * the open months were counted. Nothing here depends on anything else here, so one wait covers all of it.
 */
export async function thankDonorsCounts(args: { charityId: string; pageLive: boolean; sent: SentThankYou[]; openMonths: string[] }) {
  const unfinished = args.sent.filter((r) => !r.finished_at);
  const [unfinishedRows, open] = await Promise.all([
    Promise.all(
      unfinished.map(async (r) => {
        const month = r.period_month as string;
        const [recipients, carryOn] = await Promise.all([
          thankYouRecipients(args.charityId, month),
          // Whether the daily job really carries the rest on, by its own rules, and if not why (review 21/11/2026).
          carryOnState(
            { kind: "thank_you", id: r.id as string, charityId: args.charityId, startedBy: (r.sent_by as string | null) ?? null, startedAt: r.sent_at as string, month: String(r.period_month).slice(0, 10) },
            { pageLive: args.pageLive },
          ),
        ]);
        return { month, sent: Number(r.recipient_count ?? 0), total: recipients.length, carryOn };
      }),
    ),
    Promise.all(args.openMonths.map(async (month) => ({ month, count: (await thankYouRecipients(args.charityId, month)).length }))),
  ]);
  return { unfinished: unfinishedRows, open };
}
