/** Deposits are server-only: no browser can read or write them, not even the charity's own admin. Needs the local Supabase, seeded. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
let charity: string, admin: string;
beforeAll(async () => {
  await client.connect();
  charity = (await run("select id from public.charities where slug = $1", ["northcliff-meals-fund"])).rows[0].id;
  admin = (await run("select id from auth.users where email = $1", ["meals.admin@nedivlev.test"])).rows[0].id;
});
afterAll(() => client.end());

describe("payouts", () => {
  it("one payout per provider id; fees can't be negative; lines go with their payout", async () => {
    await run("begin");
    try {
      const p = (await run("insert into public.payouts (charity_id, gateway, gateway_payout_ref, paid_out_on, amount_cents, status) values ($1, 'test', 'P1', '2026-10-21', 165000, 'paid') returning id", [charity])).rows[0].id;
      await run("savepoint s");
      await expect(run("insert into public.payouts (charity_id, gateway, gateway_payout_ref, paid_out_on, amount_cents, status) values ($1, 'test', 'P1', '2026-10-21', 1, 'paid')", [charity])).rejects.toThrow(/payouts_once/);
      await run("rollback to savepoint s");
      await expect(run("insert into public.payout_lines (payout_id, kind, gross_cents, fee_cents, net_cents, line_no) values ($1, 'payment', 100, -1, 101, 1)", [p])).rejects.toThrow(/payout_line_fee/);
      await run("rollback to savepoint s");
      await run("insert into public.payout_lines (payout_id, kind, gross_cents, fee_cents, net_cents, line_no) values ($1, 'payment', 100, 3, 97, 1)", [p]);
      await run("delete from public.payouts where id = $1", [p]);
      expect(Number((await run("select count(*) from public.payout_lines where payout_id = $1", [p])).rows[0].count)).toBe(0);
    } finally {
      await run("rollback");
    }
  });

  it("no browser can read or write them, not even the charity's own admin", async () => {
    await run("begin");
    try {
      await run("set local role authenticated");
      await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: admin, role: "authenticated", aal: "aal2" })]);
      for (const t of ["payouts", "payout_lines"]) {
        await run("savepoint s");
        await expect(run(`select * from public.${t}`)).rejects.toThrow(/permission denied/);
        await run("rollback to savepoint s");
      }
    } finally {
      await run("rollback");
    }
  });
});
