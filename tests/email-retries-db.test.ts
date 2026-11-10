/**
 * Important emails tried again (migration 20261110000013): server-only (no browser reads or writes the list,
 * signed in or not), one row per email, only the known kinds and states, and a short last error. Needs the
 * local Supabase, seeded.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
let someone: string;
beforeAll(async () => {
  await client.connect();
  someone = (await run("select id from auth.users where email = $1", ["meals.admin@nedivlev.test"])).rows[0].id;
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
const as = async (user: string | null) => {
  await run(user ? "set local role authenticated" : "set local role anon");
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(user ? { sub: user, role: "authenticated", aal: "aal2", amr: [{ method: "otp" }] } : { role: "anon" })]);
};
async function refused(sql: string, args: unknown[], pattern: RegExp) {
  await run("savepoint s");
  await expect(run(sql, args)).rejects.toThrow(pattern);
  await run("rollback to savepoint s");
}
const REF = "11111111-1111-4111-8111-111111111111";
const add = (kind = "donation_confirmation", ref = REF) =>
  run("insert into public.email_retries (kind, ref_id, next_try_at) values ($1, $2, now() + interval '1 hour') returning id, tries, status, payload", [kind, ref]);

describe("the list of emails to try again", () => {
  it("starts a row as waiting after its first try, with an empty payload", async () => {
    await tx(async () => {
      const row = (await add()).rows[0];
      expect(row).toMatchObject({ tries: 1, status: "waiting", payload: {} });
    });
  });

  it("keeps one row per email", async () => {
    await tx(async () => {
      await add();
      await refused("insert into public.email_retries (kind, ref_id, next_try_at) values ('donation_confirmation', $1, now())", [REF], /email_retry_once/);
      // The same id under another kind is another email.
      await add("s18a_receipt");
    });
  });

  it("refuses an unknown kind or state, silly tries, a long last error and a payload that isn't an object", async () => {
    await tx(async () => {
      await refused("insert into public.email_retries (kind, ref_id, next_try_at) values ('appeal', $1, now())", [REF], /email_retry_kind/);
      await refused("insert into public.email_retries (kind, ref_id, next_try_at, status) values ('s18a_receipt', $1, now(), 'maybe')", [REF], /email_retry_status/);
      await refused("insert into public.email_retries (kind, ref_id, next_try_at, tries) values ('s18a_receipt', $1, now(), 0)", [REF], /email_retry_tries/);
      await refused("insert into public.email_retries (kind, ref_id, next_try_at, last_error) values ('s18a_receipt', $1, now(), repeat('x', 301))", [REF], /email_retry_error/);
      await refused("insert into public.email_retries (kind, ref_id, next_try_at, payload) values ('monthly_declined', $1, now(), '[1]'::jsonb)", [REF], /email_retry_payload/);
    });
  });

  it("is closed to every browser, signed in or not", async () => {
    await tx(async () => {
      await add();
      for (const who of [null, someone]) {
        await as(who);
        await refused("select * from public.email_retries", [], /permission denied/);
        await refused("insert into public.email_retries (kind, ref_id, next_try_at) values ('s18a_receipt', $1, now())", [REF], /permission denied/);
        await refused("update public.email_retries set status = 'sent'", [], /permission denied/);
        await refused("delete from public.email_retries", [], /permission denied/);
        await run("reset role");
      }
    });
  });

  it("has row-level security on", async () => {
    const r = (await run("select relrowsecurity from pg_class where oid = 'public.email_retries'::regclass")).rows[0];
    expect(r.relrowsecurity).toBe(true);
  });
});
