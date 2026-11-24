/**
 * A pretend database for counting trips (24/11/2026, dashboard speed). On the hosted site each trip to the database
 * takes a tenth of a second or more, so a read that waits for another read before it starts adds that much to every
 * page open. Every query sent while the code is waiting is answered together, as one round; `rounds` says how many
 * rounds a piece of work needed. Reads that don't depend on each other must share a round.
 */

export type Call = [string, unknown[]];
export type Reply = { data: unknown; error: unknown; count?: number | null };
export type Answer = (table: string, calls: Call[]) => Reply;

let pending: (() => void)[] = [];
let answer: Answer = () => ({ data: null, error: null });
/** Every query sent, with its table (rpc:name for a database function) and the calls that built it. */
export const sent: { table: string; calls: Call[] }[] = [];

export function answerWith(a: Answer) {
  answer = a;
  sent.length = 0;
}

/** Something that answers in the next round (a query, or a trip to the sign-in service). */
export function nextRound<T>(value: () => T): Promise<T> {
  return new Promise((resolve) => pending.push(() => resolve(value())));
}

function query(table: string) {
  const calls: Call[] = [];
  sent.push({ table, calls });
  const q: Record<string | symbol, unknown> = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === "then") {
          return (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => nextRound(() => answer(table, calls)).then(ok, bad);
        }
        return (...args: unknown[]) => {
          calls.push([String(prop), args]);
          return q;
        };
      },
    },
  );
  return q;
}

/** The parts of a Supabase client the dashboard's reads use. */
export const fakeDb = { from: (t: string) => query(t), rpc: (name: string, args?: unknown) => (query(`rpc:${name}`).eq as (...a: unknown[]) => unknown)("args", args) };

/** Runs `work` and counts the rounds of trips it needed. */
export async function rounds<T>(work: () => Promise<T>): Promise<{ result: T; rounds: number }> {
  pending = [];
  let n = 0;
  let settled: { ok: true; value: T } | { ok: false; error: unknown } | null = null;
  work().then(
    (value) => (settled = { ok: true, value }),
    (error: unknown) => (settled = { ok: false, error }),
  );
  for (;;) {
    await new Promise((r) => setImmediate(r));
    if (settled) break;
    if (!pending.length) throw new Error("stuck: waiting with nothing sent");
    const now = pending;
    pending = [];
    n++;
    for (const resolve of now) resolve();
  }
  const s = settled as { ok: true; value: T } | { ok: false; error: unknown };
  if (!s.ok) throw s.error;
  return { result: s.value, rounds: n };
}

/** Was the query built with this call (compared as JSON)? */
export const has = (calls: Call[], method: string, ...args: unknown[]) =>
  calls.some(([m, a]) => m === method && args.every((v, i) => JSON.stringify(a[i]) === JSON.stringify(v)));
