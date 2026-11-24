import "server-only";
import { getRun, listUnfinishedRuns, listUnknownReceiptEmails, listWaitingRuns, loadPlan, pendingAtYearEnd } from "./runs";
import { yearsWithReceipts } from "./year-list-store";

/**
 * Everything Admin, Receipts reads, in as few waits as the reads allow (24/11/2026, speed audit: the page took 10.6 s
 * at p95). Before, the run, the receipts list, the four boards, each waiting run's year-end count and then each
 * waiting run's plan were six waits in a row; only the last two depend on an earlier one (the waiting runs), and
 * those two don't depend on each other. `list` is the receipts query (a Supabase query, started here).
 */
export async function adminReceiptsReads<L>(args: { runId: string | null; list: PromiseLike<L> }) {
  const [justRan, list, [waiting, unfinished, years, unknownEmails]] = await Promise.all([
    args.runId ? getRun(args.runId) : Promise.resolve(null),
    args.list,
    Promise.all([listWaitingRuns(), listUnfinishedRuns(), yearsWithReceipts(), listUnknownReceiptEmails()]),
  ]);
  // The plan holds back gifts whose donor hasn't added the s18A details yet (they are never receipted as they are).
  const [pending, plans] = await Promise.all([
    Promise.all(waiting.map((w) => pendingAtYearEnd(w.charity_id, w.tax_year))),
    Promise.all(waiting.map((w) => loadPlan(w.charity_id, w.tax_year).catch(() => null))),
  ]);
  return { justRan, list, waiting, unfinished, years, unknownEmails, pending, plans };
}
