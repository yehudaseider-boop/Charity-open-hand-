/**
 * The access-token hook that refuses every password session at the source (24/11/2026). Calls the function the way
 * Supabase's sign-in service does: a token for a password sign-in, or a refresh of a session that began with one, gets
 * an error; every other sign-in comes back unchanged. Only the sign-in service may run it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
beforeAll(() => client.connect());
afterAll(() => client.end());

const event = (method: string, amr: string[]) => ({
  user_id: "8ccaa7af-909f-44e7-84cb-67cdccb56be6",
  claims: { sub: "8ccaa7af-909f-44e7-84cb-67cdccb56be6", aal: "aal1", amr: amr.map((m) => ({ method: m, timestamp: 1 })) },
  authentication_method: method,
});
const run = async (e: unknown) => (await client.query("select public.refuse_password_sessions($1::jsonb) as r", [JSON.stringify(e)])).rows[0].r;

describe("refusing password sessions at the source", () => {
  it("refuses a password sign-in and a refresh of a session that began with one", async () => {
    expect((await run(event("password", ["password"]))).error.http_code).toBe(403);
    expect((await run(event("token_refresh", ["password"]))).error.http_code).toBe(403);
    expect((await run(event("token_refresh", ["otp", "password"]))).error).toBeDefined();
  });

  it("returns every other sign-in unchanged", async () => {
    for (const [method, amr] of [["otp", ["otp"]], ["magiclink", ["otp"]], ["token_refresh", ["otp"]], ["invite", ["invite"]], ["email_change", ["otp"]], ["totp", ["otp", "totp"]]] as const) {
      const e = event(method, [...amr]);
      expect(await run(e)).toEqual(e);
    }
    const noAmr = { ...event("otp", []), claims: { sub: "x" } };
    expect(await run(noAmr)).toEqual(noAmr);
  });

  it("Supabase's sign-in service can reach the schema the hook lives in", async () => {
    const { rows } = await client.query("select has_schema_privilege('supabase_auth_admin', 'public', 'usage') as ok");
    expect(rows[0].ok).toBe(true);
  });

  it("only Supabase's sign-in service may run it", async () => {
    const { rows } = await client.query(
      `select r.rolname, has_function_privilege(r.rolname, 'public.refuse_password_sessions(jsonb)', 'execute') as can
         from pg_roles r where r.rolname in ('anon', 'authenticated', 'supabase_auth_admin') order by r.rolname`,
    );
    expect(rows).toEqual([
      { rolname: "anon", can: false },
      { rolname: "authenticated", can: false },
      { rolname: "supabase_auth_admin", can: true },
    ]);
  });
});
