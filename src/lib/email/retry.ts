import "server-only";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { afterTry, emailIsOn, nextTryAt, safeErrorText, tooOld, wasCutOff, type RetryKind, type RetryResult, type RetryStatus } from "./retry-plan";

/**
 * Important emails that failed, tried again by the daily job (10/11/2026; rules in ./retry-plan). Each failed
 * email is one row of the server-only table email_retries (migration 20261110000013): which kind it is and
 * which gift, receipt or monthly donation it belongs to. No email address is kept: the address is read again,
 * as it is then, at the moment of each try. Before the migration runs, nothing is recorded and the daily job
 * falls back to its older once-a-day resend of confirmations.
 */

export type RetryRow = { id: string; kind: RetryKind; refId: string; payload: Record<string, unknown>; tries: number; createdAt: Date };

/** One kind's sender. Throws when the send failed; otherwise says what happened. */
export type RetryHandler = (row: RetryRow, signal: AbortSignal) => Promise<Exclude<RetryResult, "failed" | "unknown">>;

/** A run's hold on a row: when it claimed it (written on the row, so only this run's finish can write it). */
export type Claim = { token: string; tookOver: boolean };

export interface RetryStore {
  /** Waiting rows whose time has come, oldest first. Null when the table isn't there yet. */
  due(now: Date, limit: number): Promise<RetryRow[] | null>;
  /**
   * Take a row for this run. Null when another run has it. `tookOver` when a run that claimed it earlier stopped
   * without finishing (its claim is more than 15 minutes old): that run may have sent it.
   */
  claim(id: string, now: Date): Promise<Claim | null>;
  /** Write a try's result and hand the claim back, only on the row this run claimed. */
  finish(id: string, claim: Claim, patch: { status: RetryStatus; tries: number; nextTryAt: Date | null; lastError: string | null }, now: Date): Promise<void>;
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
  /** Waited more than RETRY_MAX_AGE_DAYS: not tried, told once. */
  expired: number;
  /** Cut off mid-send (may have gone): not tried again by itself, told once, for a person to check. */
  unknown: number;
};

const CLAIM_MINUTES = 15;
/** Each send may take this long. A send cut off at the limit may still have gone, so it counts as unknown. */
const SEND_LIMIT_MS = 8_000;
/** No new row is started this close to the deadline: one send (8 seconds) plus its reads and writes must fit. */
const DEADLINE_MARGIN_MS = 12_000;

export async function runEmailRetries(deps: {
  store: RetryStore;
  handlers: Record<RetryKind, RetryHandler>;
  now: Date;
  deadline: number;
  emailOn?: boolean;
  audit?: (action: string, row: RetryRow, details: Record<string, unknown>) => Promise<void>;
  limit?: number;
  clock?: () => number;
}): Promise<RetrySummary> {
  const out: RetrySummary = { off: false, notSetUp: false, incomplete: false, resent: 0, skipped: 0, gone: 0, failedAgain: 0, gaveUp: 0, expired: 0, unknown: 0 };
  if (!(deps.emailOn ?? emailIsOn())) return { ...out, off: true };
  const rows = await deps.store.due(deps.now, deps.limit ?? 50);
  if (rows === null) return { ...out, notSetUp: true };
  const audit = deps.audit ?? (async () => undefined);
  const clock = deps.clock ?? Date.now;
  for (const row of rows) {
    if (clock() > deps.deadline - DEADLINE_MARGIN_MS) {
      out.incomplete = true;
      break;
    }
    // Claimed first: two daily runs at once must never send the same email twice.
    const claim = await deps.store.claim(row.id, deps.now);
    if (!claim) continue;
    let result: RetryResult;
    let lastError: string | null = null;
    let expired = false;
    if (claim.tookOver) {
      // The run that had it stopped part-way: it may have sent it. A person checks rather than risk a second copy.
      result = "unknown";
      lastError = "A run that was sending this stopped part-way; it may have gone.";
    } else if (tooOld(row.createdAt, deps.now)) {
      result = "failed";
      expired = true;
    } else {
      try {
        result = await deps.handlers[row.kind](row, AbortSignal.timeout(SEND_LIMIT_MS));
      } catch (e) {
        result = wasCutOff(e) ? "unknown" : "failed";
        lastError = safeErrorText(e);
      }
    }
    const next = expired ? { status: "gave_up" as const, tries: row.tries, nextTryAt: null } : afterTry(row.tries, result, new Date(clock()));
    try {
      await deps.store.finish(row.id, claim, { ...next, lastError }, deps.now);
    } catch (e) {
      // The claim stays on the row: in 15 minutes a later run takes it over as "unknown" and never resends it.
      console.error(`[email] could not record a try for ${row.kind} ${row.refId}`, e);
    }
    if (expired) {
      out.expired += 1;
      await audit("email.retry_gave_up", row, { kind: row.kind, tries: row.tries, reason: "too_old" });
    } else if (result === "sent") {
      out.resent += 1;
      await audit("email.retry_sent", row, { kind: row.kind, try: next.tries });
    } else if (result === "skipped") out.skipped += 1;
    else if (result === "gone") out.gone += 1;
    else if (result === "unknown") {
      out.unknown += 1;
      await audit("email.retry_unknown", row, { kind: row.kind, try: next.tries, message: lastError });
    } else if (result === "failed") {
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
        .select("id, kind, ref_id, payload, tries, created_at")
        .eq("status", "waiting")
        .lte("next_try_at", now.toISOString())
        .order("next_try_at", { ascending: true })
        .limit(limit);
      if (isMissingTable(error)) return null;
      if (error) throw new Error(`Could not list emails to try again: ${error.message}`);
      return (data ?? []).map((r) => ({
        id: r.id as string,
        kind: r.kind as RetryKind,
        refId: r.ref_id as string,
        payload: (r.payload as Record<string, unknown>) ?? {},
        tries: Number(r.tries),
        createdAt: new Date(r.created_at as string),
      }));
    },
    async claim(id, now) {
      // Precise to the millisecond and written on the row: finish matches it, so only this run writes the result.
      const token = new Date(Math.max(Date.now(), now.getTime())).toISOString();
      const fresh = await db.from("email_retries").update({ claimed_at: token }).eq("id", id).eq("status", "waiting").is("claimed_at", null).select("id");
      if (fresh.error) throw new Error(`Could not take an email to try again: ${fresh.error.message}`);
      if (fresh.data?.length) return { token, tookOver: false };
      const stale = new Date(Date.now() - CLAIM_MINUTES * 60_000).toISOString();
      const old = await db.from("email_retries").update({ claimed_at: token }).eq("id", id).eq("status", "waiting").lt("claimed_at", stale).select("id");
      if (old.error) throw new Error(`Could not take an email to try again: ${old.error.message}`);
      return old.data?.length ? { token, tookOver: true } : null;
    },
    async finish(id, claim, p, now) {
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
        .eq("id", id)
        .eq("claimed_at", claim.token);
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

/**
 * Note several confirmations that failed (found only in the audit log, from before the list existed), in one write.
 * Existing rows are kept as they are. Never throws.
 */
export async function recordFailedConfirmations(donationIds: string[], now = new Date()): Promise<void> {
  if (!donationIds.length) return;
  try {
    const next = nextTryAt(1, now)!.toISOString();
    const rows = donationIds.map((id) => ({ kind: "donation_confirmation", ref_id: id, payload: {}, tries: 1, status: "waiting", next_try_at: next, updated_at: now.toISOString() }));
    const { error } = await createAdminClient().from("email_retries").upsert(rows, { onConflict: "kind,ref_id", ignoreDuplicates: true });
    if (error && !isMissingTable(error)) console.error(`[email] could not list older failed confirmations: ${error.message}`);
  } catch (e) {
    console.error("[email] could not list older failed confirmations", e);
  }
}

/**
 * A newer email of this kind just went, so an older failed one waiting to be tried again would say the same thing
 * twice (a declined-card notice that failed yesterday, when today's notice went): mark it gone. Never throws.
 */
export async function markRetryGone(kind: RetryKind, refId: string, now = new Date()): Promise<void> {
  try {
    const { error } = await createAdminClient()
      .from("email_retries")
      .update({ status: "gone", claimed_at: null, updated_at: now.toISOString() })
      .eq("kind", kind)
      .eq("ref_id", refId)
      .eq("status", "waiting");
    if (error && !isMissingTable(error)) console.error(`[email] could not close an older ${kind} email: ${error.message}`);
  } catch (e) {
    console.error(`[email] could not close an older ${kind} email`, e);
  }
}

/**
 * Has this email already been dealt with through the list (sent by a try again, closed because it went another way,
 * left as "may have gone" for a person, or skipped on purpose), or is a run sending it right now? Then a direct send
 * (a webhook or a later check finishing a gift) must not send it again: one email per gift (review 12/11/2026).
 * A failure to read the list, or no list yet, says no: an email sent twice is better than one never sent.
 */
export async function alreadyHandled(kind: RetryKind, refId: string, now = new Date()): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().from("email_retries").select("status, claimed_at").eq("kind", kind).eq("ref_id", refId).maybeSingle();
    if (error || !data) return false;
    return retryRowSettled(data as { status: string; claimed_at: string | null }, now);
  } catch {
    return false;
  }
}

/** The rule behind alreadyHandled, on one row: settled, or claimed by a run in the last CLAIM_MINUTES. */
export function retryRowSettled(row: { status: string; claimed_at: string | null }, now: Date): boolean {
  if (row.status === "sent" || row.status === "gone" || row.status === "unknown" || row.status === "skipped") return true;
  if (row.status === "waiting" && row.claimed_at) return now.getTime() - new Date(row.claimed_at).getTime() < CLAIM_MINUTES * 60_000;
  return false;
}

/**
 * A direct send that may have gone (cut off mid-send): note it as "may have gone", so the daily job never sends it
 * again by itself and a person checks it. Creates the row if there isn't one. Never throws.
 */
export async function markRetryUnknown(kind: RetryKind, refId: string, error: unknown, now = new Date()): Promise<void> {
  try {
    const { error: dbError } = await createAdminClient()
      .from("email_retries")
      .upsert(
        { kind, ref_id: refId, payload: {}, tries: 1, status: "unknown", next_try_at: now.toISOString(), claimed_at: null, last_error: safeErrorText(error), updated_at: now.toISOString() },
        { onConflict: "kind,ref_id" },
      );
    if (dbError && !isMissingTable(dbError)) console.error(`[email] could not note a ${kind} email that may have gone: ${dbError.message}`);
  } catch (e) {
    console.error(`[email] could not note a ${kind} email that may have gone`, e);
  }
}
