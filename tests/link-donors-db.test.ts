/**
 * link_donors_to_user checks the account itself (migration 20261123000003, 23/11/2026): it links guest gifts only to
 * the account whose own, confirmed email they were given with. Fixtures are built in a transaction that is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
beforeAll(() => client.connect());
afterAll(() => client.end());

const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
const one = async (sql: string, args: unknown[] = []) => (await run(sql, args)).rows[0];
async function tx(fn: () => Promise<void>) {
  await run("begin");
  try {
    await fn();
  } finally {
    await run("rollback");
  }
}
let seq = 0;
const email = () => `ldu${++seq}-${Date.now()}@x.test`;
const user = async (address: string, confirmed: boolean) =>
  (await one("insert into auth.users (id, email, aud, role, email_confirmed_at) values (gen_random_uuid(), $1, 'authenticated', 'authenticated', $2) returning id", [address, confirmed ? new Date() : null])).id as string;
const donor = async (address: string) => (await one("insert into public.donors (email, donor_type) values ($1, 'individual') returning id", [address])).id as string;
const link = async (u: string, address: string) => (await one("select public.link_donors_to_user($1, $2) as n", [u, address])).n as number;
const owner = async (d: string) => (await one("select user_id from public.donors where id = $1", [d])).user_id as string | null;

describe("link_donors_to_user", () => {
  it("links the gifts given with the account's own confirmed email (any case or spaces)", async () => {
    await tx(async () => {
      const address = email();
      const u = await user(address, true);
      const d = await donor(address.toUpperCase());
      expect(await link(u, ` ${address.toUpperCase()} `)).toBe(1);
      expect(await owner(d)).toBe(u);
    });
  });

  it("links nothing for an email that isn't the account's, or an account whose email isn't confirmed", async () => {
    await tx(async () => {
      const mine = email();
      const theirs = email();
      const u = await user(mine, true);
      const d = await donor(theirs);
      expect(await link(u, theirs)).toBe(0);
      expect(await owner(d)).toBeNull();
      const unconfirmed = await user(theirs.replace("@", "+u@"), false);
      const d2 = await donor(theirs.replace("@", "+u@"));
      expect(await link(unconfirmed, theirs.replace("@", "+u@"))).toBe(0);
      expect(await owner(d2)).toBeNull();
    });
  });

  it("is still the server's only: a browser can't run it", async () => {
    const r = await one("select has_function_privilege('authenticated', 'public.link_donors_to_user(uuid, text)', 'execute') as a, has_function_privilege('anon', 'public.link_donors_to_user(uuid, text)', 'execute') as b");
    expect(r).toEqual({ a: false, b: false });
  });
});
