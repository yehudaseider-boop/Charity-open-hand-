/**
 * "Request a charity" (migration 20261115000001): server-only (no browser reads or writes it, signed in or not), a
 * name always, sane lengths, only web links, an email only with a consent version, and a known status and source.
 * Needs the local Supabase, seeded.
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
const insert = "insert into public.charity_requests (name, name_key, link, notify_email, consent_version, came_from, status) values ($1, $2, $3, $4, $5, $6, $7) returning id, status, created_at";
const add = (over: Partial<{ name: string; key: string; link: string | null; email: string | null; consent: string | null; from: string; status: string }> = {}) =>
  run(insert, [over.name ?? "Hope House", over.key ?? "hope house", over.link ?? null, over.email ?? null, over.consent === undefined ? null : over.consent, over.from ?? "website", over.status ?? "new"]);

describe("charity requests", () => {
  it("keeps a request with only a name, as new", async () => {
    await tx(async () => {
      const row = (await add()).rows[0];
      expect(row.status).toBe("new");
      const withEmail = (await add({ email: "Thandi@Example.test", consent: "charity-request-2026-11-15", from: "app" })).rows[0];
      expect(withEmail.id).not.toBe(row.id);
    });
  });

  it("refuses a missing name, a non-web link, an email with no consent, and unknown sources or statuses", async () => {
    await tx(async () => {
      await refused(insert, ["x", "x", null, null, null, "website", "new"], /charity_requests_name/);
      await refused(insert, ["Hope House", "hope house", "javascript:alert(1)", null, null, "website", "new"], /charity_requests_link/);
      await refused(insert, ["Hope House", "hope house", null, "a@example.test", null, "website", "new"], /charity_requests_consent_with_email/);
      await refused(insert, ["Hope House", "hope house", null, "a b@example.test", "v1", "website", "new"], /charity_requests_email_shape/);
      await refused(insert, ["Hope House", "hope house", null, null, null, "popup", "new"], /charity_requests_came_from/);
      await refused(insert, ["Hope House", "hope house", null, null, null, "website", "maybe"], /charity_requests_status/);
    });
  });

  it("is closed to every browser: visitors and signed-in people can neither read nor write it", async () => {
    await tx(async () => {
      await add({ email: "thandi@example.test", consent: "v1" });
      for (const who of [null, someone]) {
        await as(who);
        await refused("select notify_email from public.charity_requests", [], /permission denied/);
        await refused("insert into public.charity_requests (name, name_key, came_from) values ('Hope House', 'hope house', 'website')", [], /permission denied/);
        await refused("delete from public.charity_requests", [], /permission denied/);
        await run("reset role");
      }
    });
  });

  it("has row-level security on and no policy that lets a browser in", async () => {
    const t = (await run("select relrowsecurity from pg_class where oid = 'public.charity_requests'::regclass")).rows[0];
    expect(t.relrowsecurity).toBe(true);
    const policies = (await run("select policyname, permissive from pg_policies where schemaname = 'public' and tablename = 'charity_requests'")).rows;
    expect(policies).toEqual([{ policyname: "no_password_sessions", permissive: "RESTRICTIVE" }]);
  });
});
