/** receipt_runs: server-only, one open run per charity and tax year, and a cancelled run says why. Needs the local Supabase, seeded. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
let ids: Record<string, string>;
beforeAll(async () => {
  await client.connect();
  const one = async (sql: string, a: unknown[]) => (await run(sql, a)).rows[0].id as string;
  ids = {
    mealsAdmin: await one("select id from auth.users where email = $1", ["meals.admin@nedivlev.test"]),
    meals: await one("select id from public.charities where slug = $1", ["northcliff-meals-fund"]),
  };
});
afterAll(() => client.end());
async function tx(fn: () => Promise<void>) {
  await run("begin");
  try {
    await fn();
  } finally {
    await run("rollback");
  }
}
const hash = "b".repeat(64);
const insert = (status = "charity_approved", extra = "") =>
  run(`insert into public.receipt_runs (charity_id, tax_year, status, plan_fingerprint, receipts_planned, total_cents${extra ? ", " + extra.split("=")[0] : ""}) values ($1, 2026, $2, $3, 2, 100000${extra ? ", " + extra.split("=")[1] : ""}) returning id`, [ids.meals, status, hash]);

describe("receipt runs", () => {
  it("one open run per charity and tax year; a finished or cancelled one doesn't block a new one", async () => {
    await tx(async () => {
      const first = (await insert()).rows[0].id;
      await run("savepoint p");
      await expect(insert()).rejects.toThrow(/duplicate key/);
      await run("rollback to savepoint p");
      await run("update public.receipt_runs set status = 'cancelled', cancelled_at = now(), cancelled_reason = 'Taken back.' where id = $1", [first]);
      await expect(insert()).resolves.toBeTruthy();
    });
  });

  it("a cancelled run needs a reason, and an issued one needs a sign-off", async () => {
    await tx(async () => {
      await run("savepoint p");
      await expect(insert("cancelled")).rejects.toThrow(/receipt_run_cancelled/);
      await run("rollback to savepoint p");
      await expect(insert("done")).rejects.toThrow(/receipt_run_signed_off/);
      await run("rollback to savepoint p");
      await expect(insert("done", "signed_off_at=now()")).resolves.toBeTruthy();
    });
  });

  it("no browser can read or write it, not even the charity's own admin", async () => {
    await tx(async () => {
      await insert();
      await run("set local role authenticated");
      await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ids.mealsAdmin, role: "authenticated", aal: "aal2" })]);
      await run("savepoint p");
      await expect(run("select * from public.receipt_runs")).rejects.toThrow(/permission denied/);
      await run("rollback to savepoint p");
      await expect(insert()).rejects.toThrow(/permission denied/);
      await run("rollback to savepoint p");
      await run("set local role anon");
      await expect(run("select * from public.receipt_runs")).rejects.toThrow(/permission denied/);
    });
  });
});
