/**
 * The landing page's "Notify me at launch" list (migration 20261110000012): server-only (no browser reads or
 * writes it, signed in or not), one row per email whatever the capitals, a sane address, a consent version on every
 * row, and its own unsubscribe token. Needs the local Supabase, seeded.
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
const add = (email: string, consent = "launch-list-2026-11-10") =>
  run("insert into public.launch_list (email, consent_version) values ($1, $2) returning id, stop_token, source", [email, consent]);

describe("the launch list", () => {
  it("keeps one row per email whatever the capitals, with its own stop token", async () => {
    await tx(async () => {
      const first = (await add("Thandi@Example.test")).rows[0];
      expect(first.source).toBe("landing");
      expect(first.stop_token).toMatch(/^[0-9a-f-]{36}$/);
      await refused("insert into public.launch_list (email, consent_version) values ($1, 'v1')", ["thandi@example.test"], /launch_list_email_once/);
      const other = (await add("sipho@example.test")).rows[0];
      expect(other.stop_token).not.toBe(first.stop_token);
    });
  });

  it("refuses an address with no @, spaces, no consent version or an unknown source", async () => {
    await tx(async () => {
      await refused("insert into public.launch_list (email, consent_version) values ('no-at-sign', 'v1')", [], /launch_list_email_shape/);
      await refused("insert into public.launch_list (email, consent_version) values ('a b@example.test', 'v1')", [], /launch_list_email_shape/);
      await refused("insert into public.launch_list (email, consent_version) values ('ok@example.test', '')", [], /launch_list_consent/);
      await refused("insert into public.launch_list (email, consent_version, source) values ('ok@example.test', 'v1', 'popup')", [], /launch_list_source/);
    });
  });

  it("is closed to every browser: visitors and signed-in people can neither read nor write it", async () => {
    await tx(async () => {
      await add("thandi@example.test");
      for (const who of [null, someone]) {
        await as(who);
        await refused("select email from public.launch_list", [], /permission denied/);
        await refused("insert into public.launch_list (email, consent_version) values ('x@example.test', 'v1')", [], /permission denied/);
        await refused("delete from public.launch_list", [], /permission denied/);
        await run("reset role");
      }
    });
  });

  it("has row-level security on and no policy that lets a browser in", async () => {
    const t = (await run("select relrowsecurity from pg_class where oid = 'public.launch_list'::regclass")).rows[0];
    expect(t.relrowsecurity).toBe(true);
    const policies = (await run("select policyname, permissive from pg_policies where schemaname = 'public' and tablename = 'launch_list'")).rows;
    expect(policies).toEqual([{ policyname: "no_password_sessions", permissive: "RESTRICTIVE" }]);
  });
});
