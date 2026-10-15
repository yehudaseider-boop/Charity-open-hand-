/**
 * Charity invitations: only platform admins can see them; nobody writes them from a browser.
 * Needs the local Supabase, seeded.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
let ids: Record<string, string>;

beforeAll(async () => {
  await client.connect();
  const one = async (email: string) => (await run("select id from auth.users where email = $1", [email])).rows[0].id as string;
  ids = { admin: await one("admin@nedivlev.test"), mealsAdmin: await one("meals.admin@nedivlev.test") };
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
async function as(who: "anon" | string) {
  await run("reset role");
  if (who === "anon") {
    await run("set local role anon");
    await run(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
  } else {
    await run("set local role authenticated");
    await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated", aal: "aal2" })]);
  }
}
const hash = "a".repeat(64);

describe("charity invitations", () => {
  it("platform admins see them; charity admins and the public don't; nobody writes from a browser", async () => {
    await tx(async () => {
      await run("insert into public.charity_invites (token_hash, charity_name, contact_email) values ($1, 'Meals Fund', 'c@x.co')", [hash]);
      await as(ids.admin);
      expect((await run("select charity_name from public.charity_invites")).rows.length).toBeGreaterThan(0);
      await as(ids.mealsAdmin);
      expect((await run("select charity_name from public.charity_invites")).rows).toHaveLength(0);
      await run("savepoint p");
      await expect(run("insert into public.charity_invites (token_hash, charity_name, contact_email) values ($1, 'X', 'x@x.co')", ["b".repeat(64)])).rejects.toThrow(/permission denied/);
      await run("rollback to savepoint p");
      await as("anon");
      await run("savepoint q");
      await expect(run("select * from public.charity_invites")).rejects.toThrow(/permission denied/);
      await run("rollback to savepoint q");
    });
  });

  it("stores only a proper hash, never the link's secret", async () => {
    await tx(async () => {
      await run("savepoint p");
      await expect(run("insert into public.charity_invites (token_hash, charity_name, contact_email) values ('the-raw-token', 'X', 'x@x.co')")).rejects.toThrow(/check/);
      await run("rollback to savepoint p");
    });
  });
});
