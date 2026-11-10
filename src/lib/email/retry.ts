import "server-only";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { afterTry, emailIsOn, nextTryAt, safeErrorText, type RetryKind, type RetryResult, type RetryStatus } from "./retry-plan";

/**
 * Important emails that failed, tried again by the daily job (10/11/2026; rules in ./retry-plan). Each failed
 * email is one row of the server-only table email_retries (migration 20261110000013): which kind it is and
 * which gift, receipt or monthly donation it belongs to. No email address is kept: the address is read again,
 * as it is then, at the moment of each try. Before the migration runs, nothing is recorded and the daily job
 * falls back to its older once-a-day resend of confirmations.
 */

export type RetryRow = { id: string; kind: RetryKind; refId: string; payload: Record<string, unknown>; tries: number };

/** One kind's sender. Throws when the send failed; otherwise says what happened. */
export type RetryHandler = (row: RetryRow, signal: AbortSignal) => Promise<Exclude<RetryResult, "failed">>;

export interface RetryStore {
  /** Waiting rows whose time has come, oldest first. Null when the table isn't there yet. */
  due(now: Date, limit: number): Promise<RetryRow[] | null>;
  /** Take a row for this run. False when another run has it (or it was taken in the last 15 minutes). */
  claim(id: string, now: Date): Promise<boolean>;
  /** Write a try's result and hand the claim back. */
  finish(id: string, patch: { status: RetryStatus; tries: number; nextTryAt: Date | null; lastError: string | null }, now: Date): Promise<void>;
}

export type RetrySummary = {
  /** Email isn't switched on (the console transport): nothing was tried or changed. */
  off: boolean;
  /** The table isn't there yet (migration not applied). */
  notSetUp: boolean;
  /** Ran out of time: the rest is tried tomorrow. */
  incomplete: boolean;
  resent: number;
  skipped: number;
  gone: number;
  failedAgain: number;
  /** Stopped trying today, after the last try failed. Givezy is told once, in the daily email. */
  gaveUp: number;
};

const CLAIM_MINUTES = 15;
/** Each send may take this long before it is given up and counted as failed. */
const SEND_LIMIT_MS = 8_000;

export async function runEmailRetries(deps: {
  store: RetryStore;
  handlers: Record<RetryKind, RetryHandler>;
  now: Date;
  deadline: number;
  emailOn?: boolean;
  audit?: (action: string, row: RetryRow, details: Record<string, unknown>) => Promise<void>;
  limit?: number;
}): Promise<RetrySummary> {
  const out: RetrySummary = { off: false, notSetUp: false, incomplete: false, resent: 0, skipped: 0, gone: 0, failedAgain: 0, gaveUp: 0 };
  if (!(deps.emailOn ?? emailIsOn())) return { ...out, off: true };
  const rows = await deps.store.due(deps.now, deps.limit ?? 50);
  if (rows === null) return { ...out, notSetUp: true };
  const audit = deps.audit ?? (async () => undefined);
  for (const row of rows) {
    if (Date.now() > deps.deadline) {
      out.incomplete = true;
      break;
    }
    // Claimed first: two daily runs at once must never send the same email twice.
    if (!(await deps.store.claim(row.id, deps.now))) continue;
    let result: RetryResult;
    let lastError: string | null = null;
    try {
      result = await deps.handlers[row.kind](row, AbortSignal.timeout(SEND_LIMIT_MS));
    } catch (e) {
      result = "failed";
      lastError = safeErrorText(e);
    }
    const next = afterTry(row.tries, result, new Date());
    await deps.store.finish(row.id, { ...next, lastError }, deps.now);
    if (result === "sent") {
      out.resent += 1;
      await audit("email.retry_sent", row, { kind: row.kind, try: next.tries });
    } else if (result === "skipped") out.skipped += 1;
    else if (result === "gone") out.gone += 1;
    else if (result === "failed") {
      if (next.status === "gave_up") {
        out.gaveUp += 1;
        await audit("email.retry_gave_up", row, { kind: row.kind, tries: next.tries, message: lastError });
      } else out.failedAgain += 1;
    }
  }
  return out;
}

const isMissingTable = (e: { code?: string } | null | undefined) => e?.code === "PGRST205" || e?.code === "42P01";

/** The Supabase store (service role; the table is closed to every browser). */
export function supabaseRetryStore(db = createAdminClient()): RetryStore {
  return {
    async due(now, limit) {
      const { data, error } = await db
        .from("email_retries")
        .select("id, kind, ref_id, payload, tries")
        .eq("status", "waiting")
        .lte("next_try_at", now.toISOString())
        .order("next_try_at", { ascending: true })
        .limit(limit);
      if (isMissingTable(error)) return null;
      if (error) throw new Error(`Could not list emails to try again: ${error.message}`);
      return (data ?? []).map((r) => ({ id: r.id as string, kind: r.kind as RetryKind, refId: r.ref_id as string, payload: (r.payload as Record<string, unknown>) ?? {}, tries: Number(r.tries) }));
    },
    async claim(id, now) {
      const stale = new Date(now.getTime() - CLAIM_MINUTES * 60_000).toISOString();
      const { data, error } = await db
        .from("email_retries")
        .update({ claimed_at: now.toISOString() })
        .eq("id", id)
        .eq("status", "waiting")
        .or(`claimed_at.is.null,claimed_at.lt.${stale}`)
        .select("id");
      if (error) throw new Error(`Could not take an email to try again: ${error.message}`);
      return Boolean(data?.length);
    },
    async finish(id, p, now) {
      const { error } = await db
        .from("email_retries")
        .update({
          status: p.status,
          tries: p.tries,
          ...(p.nextTryAt ? { next_try_at: p.nextTryAt.toISOString() } : {}),
          last_error: p.lastError,
          claimed_at: null,
          updated_at: now.toISOString(),
        })
        .eq("id", id);
      if (error) throw new Error(`Could not record an email try: ${error.message}`);
    },
  };
}

/**
 * Note an important email that failed, so the daily job tries it again. Never throws: a failed email must never
 * undo a payment or a receipt. A second failure of the same email keeps the first row (its tries are not reset),
 * except a declined-card notice, which is replaced by the newer one (a later decline or the final one).
 */
export async function recordFailedEmail(kind: RetryKind, refId: string, opts: { payload?: Record<string, unknown>; error?: unknown; now?: Date } = {}): Promise<void> {
  try {
    const now = opts.now ?? new Date();
    const row = {
      kind,
      ref_id: refId,
      payload: opts.payload ?? {},
      tries: 1,
      status: "waiting",
      next_try_at: nextTryAt(1, now)!.toISOString(),
      claimed_at: null,
      last_error: opts.error === undefined ? null : safeErrorText(opts.error),
      updated_at: now.toISOString(),
    };
    const { error } = await createAdminClient()
      .from("email_retries")
      .upsert(row, { onConflict: "kind,ref_id", ignoreDuplicates: kind !== "monthly_declined" });
    if (error && !isMissingTable(error)) console.error(`[email] could not note a failed ${kind} email for a later try: ${error.message}`);
  } catch (e) {
    console.error(`[email] could not note a failed ${kind} email for a later try`, e);
  }
}

/** The audit row for a try again: ids and counts only, never an address or a name. */
export async function auditRetry(action: string, row: RetryRow, details: Record<string, unknown>): Promise<void> {
  const entityType = row.kind === "donation_confirmation" ? "donation" : row.kind === "s18a_receipt" ? "s18a_receipt" : "recurring_donation";
  await logAudit({ actorUserId: null, action, entityType, entityId: row.refId, details }).catch((e) => console.error("[email] could not record a try in the audit log", e));
}
