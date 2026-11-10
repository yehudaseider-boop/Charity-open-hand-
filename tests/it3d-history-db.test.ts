/**
 * A charity's IT3(d) history (migration 20261110000005): server-only (no browser reads or writes it, with or
 * without a second step or a password), counts and a total only, the facts of a download never change, the
 * owner's mark is a real day with a short plain reference, and rows go with the charity. Needs the local
 * Supabase, seeded.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
let charity: string, admin: string, otherAdmin: string;
beforeAll(async () => {
  await client.connect();
  charity = (await run("select id from public.charities where slug = $1", ["northcliff-meals-fund"])).rows[0].id;
  admin = (await run("select id from auth.users where email = $1", ["meals.admin@nedivlev.test"])).rows[0].id;
  otherAdmin = (await run("select id from auth.users where email = $1", ["hall.admin@nedivlev.test"])).rows[0].id;
});
afterAll(() => client.end());

const tx = async (fn: () => Promise<void>) => {
  await run("begin");
  try {
    await fn();
  } finally {
    await run("rollback");
  }
};
const as = async (user: string | null, aal = "aal2", method = "otp") => {
  await run(user ? "set local role authenticated" : "set local role anon");
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(user ? { sub: user, role: "authenticated", aal, amr: [{ method }] } : { role: "anon" })]);
};
async function refused(sql: string, args: unknown[], pattern: RegExp) {
  await run("savepoint s");
  await expect(run(sql, args)).rejects.toThrow(pattern);
  await run("rollback to savepoint s");
}
const add = async (over: Record<string, unknown> = {}) => {
  const row = { charity_id: charity, tax_year: 2027, period: "full_year", kind: "file", test_data: false, receipts: 3, donors: 2, donations: 4, total_cents: 125000, receipts_left_out: 0, created_by: admin, ...over };
  const keys = Object.keys(row);
  return (await run(`insert into public.charity_it3d_history (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`, Object.values(row))).rows[0].id as string;
};
const count = async () => Number((await run("select count(*) from public.charity_it3d_history")).rows[0].count);

describe("the IT3(d) history table", () => {
  it("holds counts and a total only: no column for a name, a number that identifies someone, a file or the Source Identifier", async () => {
    const columns = (await run("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'charity_it3d_history' order by ordinal_position")).rows.map((r) => r.column_name);
    expect(columns).toEqual([
      "id", "charity_id", "tax_year", "period", "kind", "test_data", "receipts", "donors", "donations", "total_cents", "receipts_left_out",
      "created_by", "created_at", "uploaded_on", "upload_reference", "marked_by", "marked_at",
    ]);
    const secured = (await run("select relrowsecurity from pg_class where oid = 'public.charity_it3d_history'::regclass")).rows[0].relrowsecurity;
    expect(secured).toBe(true);
  });

  it("no browser session reads or writes it: not the charity's own admin, another charity's, a password session or a visitor", async () => {
    await tx(async () => {
      const id = await add();
      for (const [user, aal, method] of [[admin, "aal2", "otp"], [admin, "aal1", "otp"], [admin, "aal2", "password"], [otherAdmin, "aal2", "otp"], [null, "", ""]] as const) {
        await as(user, aal, method);
        await refused("select count(*) from public.charity_it3d_history", [], /permission denied/);
        await refused("insert into public.charity_it3d_history (charity_id, tax_year, period, kind, receipts, donors, donations, total_cents) values ($1, 2027, 'full_year', 'file', 1, 1, 1, 100)", [charity], /permission denied/);
        await refused("update public.charity_it3d_history set uploaded_on = current_date, marked_at = now() where id = $1", [id], /permission denied/);
        await refused("delete from public.charity_it3d_history where id = $1", [id], /permission denied/);
        await run("reset role");
      }
      expect(await count()).toBeGreaterThanOrEqual(1);
    });
  });

  it("refuses a period, kind, year or count that makes no sense, and a test capture sheet", async () => {
    await tx(async () => {
      const bad: [Record<string, unknown>, RegExp][] = [
        [{ period: "second_half" }, /it3d_history_period/],
        [{ kind: "email" }, /it3d_history_kind/],
        [{ tax_year: 2021 }, /it3d_history_year/],
        [{ receipts: -1 }, /it3d_history_receipts/],
        [{ donors: -1 }, /it3d_history_donors/],
        [{ donations: -1 }, /it3d_history_donations/],
        [{ total_cents: -1 }, /it3d_history_total/],
        [{ receipts_left_out: -1 }, /it3d_history_left_out/],
        [{ kind: "sheet", test_data: true }, /it3d_history_sheet_is_live/],
        [{ upload_reference: "ref" }, /it3d_history_mark/],
        [{ uploaded_on: "2026-11-10" }, /it3d_history_mark/],
      ];
      for (const [over, pattern] of bad) {
        await run("savepoint s");
        await expect(add(over)).rejects.toThrow(pattern);
        await run("rollback to savepoint s");
      }
      await add({ kind: "sheet", period: "first_half", receipts: 0, donors: 0, donations: 0, total_cents: 0 });
      // A total far over 32 bits is whole cents all the same.
      const big = await add({ total_cents: "9000000000000" });
      expect((await run("select total_cents from public.charity_it3d_history where id = $1", [big])).rows[0].total_cents).toBe("9000000000000");
    });
  });

  it("the owner's mark: a day from the download to today, a short one-line reference, and it comes off again", async () => {
    await tx(async () => {
      const id = await add();
      const mark = "update public.charity_it3d_history set uploaded_on = $2, upload_reference = $3, marked_by = $4, marked_at = now() where id = $1";
      const today = (await run("select (now() at time zone 'Africa/Johannesburg')::date::text as d")).rows[0].d as string;
      const day = async (offset: number) => (await run("select ($1::date + $2::int)::text as d", [today, offset])).rows[0].d as string;
      await refused(mark, [id, await day(1), null, admin], /it3d_history_uploaded_on/);
      await refused(mark, [id, await day(-1), null, admin], /it3d_history_uploaded_on/);
      await refused(mark, [id, today, "x".repeat(41), admin], /it3d_history_reference/);
      await refused(mark, [id, today, "two\nlines", admin], /it3d_history_reference/);
      await refused(mark, [id, today, "", admin], /it3d_history_reference/);
      await refused("update public.charity_it3d_history set uploaded_on = $2 where id = $1", [id, today], /it3d_history_mark/);
      await run(mark, [id, today, "eFiling 2027/00123", admin]);
      expect((await run("select uploaded_on::text, upload_reference from public.charity_it3d_history where id = $1", [id])).rows[0]).toEqual({ uploaded_on: today, upload_reference: "eFiling 2027/00123" });
      await run("update public.charity_it3d_history set uploaded_on = null, upload_reference = null, marked_by = null, marked_at = null where id = $1", [id]);
      expect((await run("select uploaded_on, marked_at from public.charity_it3d_history where id = $1", [id])).rows[0]).toEqual({ uploaded_on: null, marked_at: null });
    });
  });

  it("what was downloaded never changes afterwards, even for the server", async () => {
    await tx(async () => {
      const id = await add();
      for (const set of ["receipts = 99", "donors = 99", "donations = 99", "total_cents = 1", "receipts_left_out = 5", "tax_year = 2026", "period = 'first_half'", "kind = 'sheet'", "test_data = true", "created_at = now() - interval '1 day'"]) {
        await refused(`update public.charity_it3d_history set ${set} where id = $1`, [id], /it3d_history_fixed/);
      }
      const other = (await run("select id from public.charities where slug = $1", ["glenhazel-community-hall"])).rows[0].id;
      await refused("update public.charity_it3d_history set charity_id = $2 where id = $1", [id, other], /it3d_history_fixed/);
    });
  });

  it("an entry outlives the person who made it, and goes with the charity", async () => {
    await tx(async () => {
      const id = await add();
      // What deleting the person does (set null) is allowed by the rule that keeps a download's facts fixed.
      await run("update public.charity_it3d_history set created_by = null where id = $1", [id]);
      expect((await run("select created_by from public.charity_it3d_history where id = $1", [id])).rows[0].created_by).toBeNull();
      const fk = (await run(
        "select c.confdeltype::text as rule, a.attname::text as col from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1] where c.conrelid = 'public.charity_it3d_history'::regclass and c.contype = 'f' order by a.attname",
      )).rows;
      // c = cascade (deleted with the charity), n = set null (the people).
      expect(fk).toEqual([{ rule: "c", col: "charity_id" }, { rule: "n", col: "created_by" }, { rule: "n", col: "marked_by" }]);
    });
  });
});
