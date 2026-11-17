/**
 * How an online gift was paid (migration 20261117000001): the column is optional, only plain words fit, and it
 * is written by the server only (a browser can't change it). Needs the local Supabase, seeded.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
beforeAll(async () => {
  await client.connect();
});
afterAll(() => client.end());

describe("donations.payment_channel", () => {
  it("is optional and allows only lower case letters, digits and underscores, up to 40", async () => {
    const col = (await run("select is_nullable from information_schema.columns where table_schema='public' and table_name='donations' and column_name='payment_channel'")).rows[0];
    expect(col.is_nullable).toBe("YES");
    const def = (await run("select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'donation_payment_channel'")).rows[0].d as string;
    expect(def).toMatch(/\^\[a-z0-9_\]\{1,40\}\$/);
  });

  it("is not writable by a browser (visitors or signed-in people)", async () => {
    for (const role of ["anon", "authenticated"]) {
      const r = await run("select has_column_privilege($1, 'public.donations', 'payment_channel', 'update') as can_update", [role]);
      expect(r.rows[0].can_update).toBe(false);
    }
  });
});
