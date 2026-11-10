/** Thank-you tables: the charity's admins read their own sends; nobody but the server touches opt-outs or links. Needs the local Supabase, seeded. */
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
    hallAdmin: await one("select id from auth.users where email = $1", ["hall.admin@nedivlev.test"]),
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
async function as(who: string | null) {
  await run("reset role");
  if (!who) return run("set local role anon");
  await run("set local role authenticated");
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated", aal: "aal2" })]);
}
const hash = "a".repeat(64);

describe("thank-you tables", () => {
  it("one send per charity per month, readable by that charity's admins only", async () => {
    await tx(async () => {
      await run("insert into public.charity_thank_yous (charity_id, period_month, body) values ($1, '2026-10-01', 'Thank you all.')", [ids.meals]);
      await run("savepoint p");
      await expect(run("insert into public.charity_thank_yous (charity_id, period_month, body) values ($1, '2026-10-01', 'Again, thanks.')", [ids.meals])).rejects.toThrow(/duplicate/);
      await run("rollback to savepoint p");
      await as(ids.mealsAdmin);
      expect((await run("select count(*)::int n from public.charity_thank_yous where charity_id = $1", [ids.meals])).rows[0].n).toBe(1);
      await run("savepoint u");
      await expect(run("update public.charity_thank_yous set body = 'changed text'")).rejects.toThrow(/permission denied/);
      await run("rollback to savepoint u");
      await as(ids.hallAdmin);
      expect((await run("select count(*)::int n from public.charity_thank_yous where charity_id = $1", [ids.meals])).rows[0].n).toBe(0);
    });
  });
  it("opt-outs and stop links are closed to everyone but the server", async () => {
    await tx(async () => {
      await run("insert into public.thank_you_opt_outs (email_hash) values ($1)", [hash]);
      for (const who of [null, ids.mealsAdmin]) {
        await as(who);
        await run("savepoint q");
        await expect(run("select * from public.thank_you_opt_outs")).rejects.toThrow(/permission denied/);
        await run("rollback to savepoint q");
        await expect(run("select * from public.email_stop_tokens")).rejects.toThrow(/permission denied/);
        await run("rollback to savepoint q");
      }
    });
  });
});

describe("personal thank-yous", () => {
  it("once a week per donor, and closed to everyone but the server", async () => {
    await tx(async () => {
      const donor = (await run("insert into public.donors (email, first_name) values ('thanks.test@example.com', 'Thandi') returning id")).rows[0].id;
      await run("insert into public.charity_donor_thanks (charity_id, donor_id, week_start, body) values ($1, $2, '2026-10-12', 'Thank you so much.')", [ids.meals, donor]);
      await run("savepoint p");
      await expect(run("insert into public.charity_donor_thanks (charity_id, donor_id, week_start, body) values ($1, $2, '2026-10-12', 'Thank you again.')", [ids.meals, donor])).rejects.toThrow(/duplicate/);
      await run("rollback to savepoint p");
      for (const who of [null, ids.mealsAdmin]) {
        await as(who);
        await run("savepoint q");
        await expect(run("select * from public.charity_donor_thanks")).rejects.toThrow(/permission denied/);
        await run("rollback to savepoint q");
      }
    });
  });
});

describe("s18A details reminders share the donor's week (10/11/2026)", () => {
  it("a thank-you and a reminder can't both go to a donor in one week; other kinds are refused", async () => {
    await tx(async () => {
      const donor = (await run("insert into public.donors (email, first_name) values ('reminder.test@example.com', 'Lerato') returning id")).rows[0].id;
      await run("insert into public.charity_donor_thanks (charity_id, donor_id, week_start, kind, body) values ($1, $2, '2026-11-09', 's18a_details_reminder', 'A reminder to add the details for an s18A receipt.')", [ids.meals, donor]);
      await run("savepoint p");
      await expect(run("insert into public.charity_donor_thanks (charity_id, donor_id, week_start, body) values ($1, $2, '2026-11-09', 'Thank you so much.')", [ids.meals, donor])).rejects.toThrow(/duplicate/);
      await run("rollback to savepoint p");
      await expect(run("insert into public.charity_donor_thanks (charity_id, donor_id, week_start, kind, body) values ($1, $2, '2026-11-16', 'newsletter', 'Something else entirely.')", [ids.meals, donor])).rejects.toThrow(/donor_message_kind/);
      await run("rollback to savepoint p");
      // An existing thank-you is a thank-you.
      await run("insert into public.charity_donor_thanks (charity_id, donor_id, week_start, body) values ($1, $2, '2026-11-16', 'Thank you so much.')", [ids.meals, donor]);
      expect((await run("select kind from public.charity_donor_thanks where donor_id = $1 and week_start = '2026-11-16'", [donor])).rows[0].kind).toBe("thank_you");
      await as(ids.mealsAdmin);
      await run("savepoint q");
      await expect(run("select kind from public.charity_donor_thanks")).rejects.toThrow(/permission denied/);
      await run("rollback to savepoint q");
    });
  });
});
