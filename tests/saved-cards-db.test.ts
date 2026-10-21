/**
 * Saved cards live only on the server: signed-in users cannot read or write the tables, not even their
 * own row, the card goes when the account's data is erased or the account is deleted, and the
 * database accepts the "saved_card" agreement only with a donation. Needs the local Supabase, seeded.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
let donorUser: string;

beforeAll(async () => {
  await client.connect();
  donorUser = (await run("select id from auth.users where email = $1", ["donor@nedivlev.test"])).rows[0].id as string;
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

/** The statement must be refused. A savepoint keeps the surrounding transaction usable afterwards. */
async function denied(sql: string, args: unknown[] = []) {
  await run("savepoint attempt");
  let message = "";
  try {
    await run(sql, args);
  } catch (e) {
    message = (e as Error).message;
  }
  await run("rollback to savepoint attempt");
  expect(message).toMatch(/permission denied/);
}

const asUser = async (id: string) => {
  await run("set local role authenticated");
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
};

describe("saved cards", () => {
  it("signed-in users can neither read nor write them, not even their own", async () => {
    await tx(async () => {
      await run("insert into public.saved_cards (user_id, authorization_encrypted, card_last4, gateway) values ($1, 'v1.x.y.z', '4242', 'test')", [donorUser]);
      await asUser(donorUser);
      await denied("select * from public.saved_cards");
      await denied("delete from public.saved_cards");
      await denied("insert into public.saved_cards (user_id, authorization_encrypted, gateway) values ($1, 'x', 'test')", [donorUser]);
    });
  });

  it("the same for requests to save a card, and anonymous visitors see nothing", async () => {
    await tx(async () => {
      await run("set local role anon");
      await denied("select * from public.saved_cards");
      await denied("select * from public.card_save_requests");
    });
    await tx(async () => {
      await asUser(donorUser);
      await denied("select * from public.card_save_requests");
    });
  });

  it("keeps one card per account and only a four-digit ending", async () => {
    await tx(async () => {
      await run("insert into public.saved_cards (user_id, authorization_encrypted, card_last4, gateway) values ($1, 'v1.a', '4242', 'test')", [donorUser]);
      await expect(run("insert into public.saved_cards (user_id, authorization_encrypted, gateway) values ($1, 'v1.b', 'test')", [donorUser])).rejects.toThrow(/duplicate key/);
    });
    await tx(async () => {
      await expect(run("insert into public.saved_cards (user_id, authorization_encrypted, card_last4, gateway) values ($1, 'v1.a', '42', 'test')", [donorUser])).rejects.toThrow(/check constraint/);
    });
  });

  it("goes with the account when it is deleted", async () => {
    await tx(async () => {
      const u = (await run("insert into auth.users (id, email) values (gen_random_uuid(), 'card-gone@example.co.za') returning id")).rows[0].id as string;
      await run("insert into public.saved_cards (user_id, authorization_encrypted, gateway) values ($1, 'v1.a', 'test')", [u]);
      await run("delete from auth.users where id = $1", [u]);
      expect((await run("select count(*)::int as n from public.saved_cards where user_id = $1", [u])).rows[0].n).toBe(0);
    });
  });

  it("accepts the saved_card agreement only together with a donation", async () => {
    await tx(async () => {
      await expect(run("insert into public.consents (kind, policy_version) values ('saved_card', 'v1')")).rejects.toThrow(/check constraint/);
    });
  });
});
