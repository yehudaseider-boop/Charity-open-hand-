/**
 * hook_refuse_password_sign_in (migration 20261123000004, 23/11/2026): Supabase's "Password verification attempt" hook,
 * which refuses every password sign-in. The payloads are modelled on Supabase Auth's own
 * (internal/hooks/v0hooks/v0hooks.go, PasswordVerificationAttemptInput: metadata, user_id, valid). The migration is run
 * again inside a transaction that is rolled back, with Supabase's hook role made if this database doesn't have it, so
 * the test also checks who may run the function.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
beforeAll(() => client.connect());
afterAll(() => client.end());

const migration = readFileSync(join(__dirname, "../supabase/migrations/20261123000004_refuse_password_sign_ins.sql"), "utf8");
const one = async (sql: string, args: unknown[] = []) => (await client.query(sql, args)).rows[0];
async function withMigration(fn: () => Promise<void>) {
  await client.query("begin");
  try {
    await client.query("do $$ begin if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if; end $$;");
    await client.query(migration);
    await fn();
  } finally {
    await client.query("rollback");
  }
}

const payload = (valid: boolean) => ({
  metadata: { uuid: "0b6e2a5e-7f37-4f0e-9d2b-3f1b8d2c9a10", time: "2026-11-23T08:00:00Z", name: "password-verification", ip_address: "198.51.100.7" },
  user_id: "5f0c3c1e-2d4b-4b8e-9a77-1f2e3d4c5b6a",
  valid,
});
const decide = async (event: unknown) => (await one("select public.hook_refuse_password_sign_in($1::jsonb) as r", [JSON.stringify(event)])).r;

describe("hook_refuse_password_sign_in", () => {
  it("refuses a password sign-in with the right password, in plain words, without signing the person out", async () => {
    await withMigration(async () => {
      const r = await decide(payload(true));
      expect(r).toEqual({ decision: "reject", message: "Givezy doesn't use passwords. Sign in with the code we email you.", should_logout_user: false });
    });
  });

  it("refuses a wrong password the same way, so a stranger can't sign the owner out or learn anything", async () => {
    await withMigration(async () => {
      expect(await decide(payload(false))).toEqual(await decide(payload(true)));
    });
  });

  it("refuses odd or empty payloads too", async () => {
    await withMigration(async () => {
      for (const event of [{}, { user_id: null }, { valid: "yes" }]) expect((await decide(event)).decision).toBe("reject");
    });
  });

  it("only Supabase's hook role can run it", async () => {
    await withMigration(async () => {
      const r = await one(
        `select has_function_privilege('supabase_auth_admin', 'public.hook_refuse_password_sign_in(jsonb)', 'execute') as hook,
                has_function_privilege('anon', 'public.hook_refuse_password_sign_in(jsonb)', 'execute') as anon,
                has_function_privilege('authenticated', 'public.hook_refuse_password_sign_in(jsonb)', 'execute') as signed_in,
                has_function_privilege('service_role', 'public.hook_refuse_password_sign_in(jsonb)', 'execute') as server`,
      );
      expect(r).toEqual({ hook: true, anon: false, signed_in: false, server: false });
    });
  });

  it("pins its search path and isn't a security-definer function", async () => {
    await withMigration(async () => {
      const r = await one(
        `select p.prosecdef as definer, p.proconfig as config from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'hook_refuse_password_sign_in'`,
      );
      expect(r.definer).toBe(false);
      expect(r.config).toContain('search_path=""');
    });
  });
});
