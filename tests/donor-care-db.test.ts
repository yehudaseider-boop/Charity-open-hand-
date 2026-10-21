/** Donor care tables are server-only, one tag name per charity, and go with the donor or the charity. Needs the local Supabase, seeded. */
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
const TABLES = ["charity_donor_notes", "charity_donor_reminders", "charity_tags", "charity_donor_tags", "charity_segments", "charity_donor_settings"];

describe("donor care tables", () => {
  it("one tag name per charity whatever the case, a sane lapsed period, and a donor's rows go with them", async () => {
    await run("begin");
    try {
      const donor = (await run("insert into public.donors (email, donor_type) values ('care@x.test', 'individual') returning id")).rows[0].id;
      const tag = (await run("insert into public.charity_tags (charity_id, name) values ($1, 'Volunteer') returning id", [charity])).rows[0].id;
      await run("savepoint s");
      await expect(run("insert into public.charity_tags (charity_id, name) values ($1, 'VOLUNTEER')", [charity])).rejects.toThrow(/charity_tags_name/);
      await run("rollback to savepoint s");
      await expect(run("insert into public.charity_donor_settings (charity_id, lapsed_after_days) values ($1, 10)", [charity])).rejects.toThrow(/donor_settings_lapsed/);
      await run("rollback to savepoint s");
      await run("insert into public.charity_donor_tags (tag_id, charity_id, donor_id) values ($1, $2, $3)", [tag, charity, donor]);
      await run("insert into public.charity_donor_notes (charity_id, donor_id, body) values ($1, $2, 'Met at the gala')", [charity, donor]);
      await run("insert into public.charity_donor_reminders (charity_id, donor_id, due_on, what) values ($1, $2, '2026-11-01', 'Phone')", [charity, donor]);
      await run("delete from public.donors where id = $1", [donor]);
      for (const t of ["charity_donor_tags", "charity_donor_notes", "charity_donor_reminders"]) {
        expect(Number((await run(`select count(*) from public.${t} where charity_id = $1`, [charity])).rows[0].count)).toBe(0);
      }
    } finally {
      await run("rollback");
    }
  });

  it("no browser can read or write them, not even the charity's own admin", async () => {
    await run("begin");
    try {
      await run("set local role authenticated");
      await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: admin, role: "authenticated", aal: "aal2" })]);
      for (const t of TABLES) {
        await run("savepoint s");
        await expect(run(`select * from public.${t}`)).rejects.toThrow(/permission denied/);
        await run("rollback to savepoint s");
      }
    } finally {
      await run("rollback");
    }
  });
});
