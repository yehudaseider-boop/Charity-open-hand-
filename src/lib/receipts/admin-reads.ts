import "server-only";
import { getRun, listUnfinishedRuns, listUnknownReceiptEmails, listWaitingRuns, loadPlan, pendingAtYearEnd } from "./runs";
import { yearsWithReceipts } from "./year-list-store";

/**
 * Everything Admin, Receipts reads, in as few waits as the reads allow (24/11/2026, speed audit: the page took 10.6 s
 * at p95). Before, the run, the receipts list, the four boards, each waiting run's year-end count and then each
 * waiting run's plan were six waits in a row; only the last two depend on an earlier one (the waiting runs), and
 * those two don't depend on each other. `list` is the receipts query (a Supabase query, started here).
 */
/** How many waiting charities are read at the same time. */
export const WAITING_AT_ONCE = 4;

/** Like Promise.all(items.map(fn)), but never more than `limit` running at once; results keep the items' order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function adminReceiptsReads<L>(args: { runId: string | null; list: PromiseLike<L> }) {
  const [justRan, list, [waiting, unfinished, years, unknownEmails]] = await Promise.all([
    args.runId ? getRun(args.runId) : Promise.resolve(null),
    args.list,
    Promise.all([listWaitingRuns(), listUnfinishedRuns(), yearsWithReceipts(), listUnknownReceiptEmails()]),
  ]);
  // The plan holds back gifts whose donor hasn't added the s18A details yet (they are never receipted as they are).
  // At most a few charities at a time (review 24/11/2026): at year end dozens are waiting, each paging several tables.
  const [pending, plans] = await Promise.all([
    mapLimit(waiting, WAITING_AT_ONCE, (w) => pendingAtYearEnd(w.charity_id, w.tax_year)),
    mapLimit(waiting, WAITING_AT_ONCE, (w) => loadPlan(w.charity_id, w.tax_year).catch(() => null)),
  ]);
  return { justRan, list, waiting, unfinished, years, unknownEmails, pending, plans };
}
