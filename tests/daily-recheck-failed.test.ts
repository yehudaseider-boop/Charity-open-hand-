/**
 * The daily safety net also asks the provider again about gifts closed as failed in the last 7 days (23/11/2026):
 * a gift closed as failed can still turn out paid. Bounded per run. Database and payment check are stand-ins.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const confirmed: string[] = [];
let answer: (ref: string) => Promise<string> = async () => "failed";
vi.mock("@/lib/donations/confirm", () => ({ confirmPayment: async (ref: string) => (confirmed.push(ref), answer(ref)) }));
vi.mock("@/lib/charity-requests-notify", () => ({ clearExpiredEmails: async () => {}, clearStaleClaims: async () => {} }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => false }));
vi.mock("@/lib/donations/notify", () => ({ deliverDonorConfirmation: async () => ({}) }));
vi.mock("@/lib/donations/monthly-declined-retry", () => ({ retryDeclinedNotice: async () => ({}) }));
vi.mock("@/lib/receipts/email-retry", () => ({ retryReceiptEmail: async () => ({}) }));
vi.mock("@/lib/email/retry", () => ({
  auditRetry: async () => {},
  recordFailedConfirmations: async () => {},
  runEmailRetries: async () => ({}),
  supabaseRetryStore: () => ({}),
}));

let failedRows: { gateway_ref: string }[] = [];
const failedQueries: { limit?: number; failedSince?: string }[] = [];
/** A query builder that answers every read with nothing, except the read of gifts closed as failed. */
function builder(table: string) {
  const state: { status?: string; limit?: number; failedSince?: string } = {};
  const empty = { data: [], count: 0, error: null };
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = (c: string, v: unknown) => (c === "status" && (state.status = String(v)), q);
  q.gte = (c: string, v: string) => (c === "failed_at" && (state.failedSince = v), q);
  for (const m of ["neq", "lt", "lte", "in", "is", "not", "or", "order"]) q[m] = () => q;
  q.limit = async (n: number) => {
    state.limit = n;
    if (table === "donations" && state.status === "failed") {
      failedQueries.push({ limit: n, failedSince: state.failedSince });
      return { data: failedRows.slice(0, n), count: failedRows.length, error: null };
    }
    return empty;
  };
  q.then = (ok: (v: unknown) => unknown) => Promise.resolve(empty).then(ok);
  return q;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: builder }) }));

const { runDailyChecks, RECHECK_FAILED_PER_RUN } = await import("@/lib/ops/daily");
const NOW = new Date("2026-11-23T04:00:00Z");
const retries = { incomplete: false, confirmations: { resent: 0, failedAgain: 0 } };

beforeEach(() => {
  confirmed.length = 0;
  failedQueries.length = 0;
  failedRows = [];
  answer = async () => "failed";
});

describe("gifts closed as failed in the last 7 days", () => {
  it("are asked about again, and one the provider now says is paid is counted", async () => {
    failedRows = [{ gateway_ref: "aaaa" }, { gateway_ref: "bbbb" }];
    answer = async (ref) => (ref === "bbbb" ? "paid" : "failed");
    const out = await runDailyChecks(NOW, Infinity, { retries });
    expect(confirmed).toEqual(["aaaa", "bbbb"]);
    expect(out.pending.paid).toBe(1);
    expect(failedQueries[0].failedSince).toBe(new Date(NOW.getTime() - 7 * 24 * 3_600_000).toISOString());
  });

  it("are bounded per run, and a provider that can't be reached for one doesn't stop the rest", async () => {
    failedRows = Array.from({ length: RECHECK_FAILED_PER_RUN + 30 }, (_, i) => ({ gateway_ref: `ref-${i}` }));
    answer = async (ref) => {
      if (ref === "ref-0") throw new Error("provider down");
      return "failed";
    };
    const out = await runDailyChecks(NOW, Infinity, { retries });
    expect(failedQueries[0].limit).toBe(RECHECK_FAILED_PER_RUN);
    expect(confirmed).toHaveLength(RECHECK_FAILED_PER_RUN);
    expect(out.pending.errors).toBe(1);
  });

  it("stops at the time limit and says the checks were cut short", async () => {
    failedRows = [{ gateway_ref: "aaaa" }];
    const out = await runDailyChecks(NOW, Date.now() - 1, { retries });
    expect(confirmed).toEqual([]);
    expect(out.incomplete).toBe(true);
  });
});
