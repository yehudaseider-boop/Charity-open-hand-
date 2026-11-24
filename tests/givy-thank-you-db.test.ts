/**
 * Givy's thank-yous in the database (migration 20261124000013_givy_thank_yous.sql, 24/11/2026): who can read and write
 * the in-app messages and the kept drafts. Checked the way the API sees people (database role and signed-in claims).
 * Needs the local Supabase, seeded, with the migration applied.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
let ids: Record<string, string>;

beforeAll(async () => {
  await client.connect();
  const one = async (sql: string, a: unknown[]) => (await run(sql, a)).rows[0].id as string;
  ids = {
    donorUser: await one("select id from auth.users where email = $1", ["donor@nedivlev.test"]),
    donor: await one("select id from public.donors where email = $1", ["donor@nedivlev.test"]),
    mealsAdmin: await one("select id from auth.users where email = $1", ["meals.admin@nedivlev.test"]),
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
async function as(who: "anon" | string) {
  await run("reset role");
  if (who === "anon") {
    await run("set local role anon");
    await run(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
  } else {
    await run("set local role authenticated");
    await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated", aal: "aal2", amr: [{ method: "otp", timestamp: 0 }] })]);
  }
}
async function denied(sql: string, args: unknown[] = []) {
  await run("savepoint p");
  await expect(run(sql, args)).rejects.toThrow(/permission denied|violates row-level security/);
  await run("rollback to savepoint p");
}
/** A second app account, and one message for each of the two donors (written as the server would). */
async function twoMessages() {
  await run("reset role");
  const other = (await run("insert into auth.users (id, email, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated') returning id", [`msg${Date.now()}@x.test`])).rows[0].id as string;
  const mine = (await run("insert into public.donor_messages (charity_id, user_id, donor_id, subject, body) values ($1, $2, $3, 'Thank you', 'Thank you for your gift.') returning id", [ids.meals, ids.donorUser, ids.donor])).rows[0].id as string;
  const theirs = (await run("insert into public.donor_messages (charity_id, user_id, subject, body) values ($1, $2, 'Thank you', 'Someone else''s message.') returning id", [ids.meals, other])).rows[0].id as string;
  return { other, mine, theirs };
}

describe("in-app messages from charities", () => {
  it("a donor reads only their own", async () => {
    await tx(async () => {
      const { mine, theirs } = await twoMessages();
      await as(ids.donorUser);
      const seen = (await run("select id from public.donor_messages")).rows.map((r) => r.id);
      expect(seen).toContain(mine);
      expect(seen).not.toContain(theirs);
    });
  });

  it("a donor can mark their own read, and nothing else", async () => {
    await tx(async () => {
      const { mine, theirs } = await twoMessages();
      await as(ids.donorUser);
      const marked = await run("update public.donor_messages set read_at = now() where id = $1 returning id", [mine]);
      expect(marked.rowCount).toBe(1);
      // Someone else's: row-level security leaves it untouched.
      const other = await run("update public.donor_messages set read_at = now() where id = $1 returning id", [theirs]);
      expect(other.rowCount).toBe(0);
      // No other column, no writing, no deleting.
      await denied("update public.donor_messages set body = 'changed' where id = $1", [mine]);
      await denied("insert into public.donor_messages (charity_id, user_id, subject, body) values ($1, $2, 'Hi', 'Written by a donor')", [ids.meals, ids.donorUser]);
      await denied("delete from public.donor_messages where id = $1", [mine]);
    });
  });

  it("a visitor and a charity's team can't read them", async () => {
    await tx(async () => {
      await twoMessages();
      await as("anon");
      await denied("select id from public.donor_messages");
      await as(ids.mealsAdmin);
      expect((await run("select id from public.donor_messages")).rowCount).toBe(0);
    });
  });

  it("one per email and app account", async () => {
    await tx(async () => {
      await run("reset role");
      const appeal = (await run("insert into public.charity_appeals (charity_id, subject, body, audience, audience_label) values ($1, 'Thank you', 'Thank you for giving this month.', '{\"value\":\"gave:this_month\",\"inApp\":true}', 'Gave this month') returning id", [ids.meals])).rows[0].id;
      await run("insert into public.donor_messages (charity_id, user_id, donor_id, appeal_id, subject, body) values ($1, $2, $3, $4, 'Thank you', 'Thank you.')", [ids.meals, ids.donorUser, ids.donor, appeal]);
      await run("savepoint p");
      await expect(run("insert into public.donor_messages (charity_id, user_id, donor_id, appeal_id, subject, body) values ($1, $2, $3, $4, 'Thank you', 'Thank you.')", [ids.meals, ids.donorUser, ids.donor, appeal])).rejects.toThrow(/donor_message_once/);
      await run("rollback to savepoint p");
    });
  });
});

describe("Givy's kept drafts", () => {
  it("only the server reaches them: not the person who asked, not a visitor", async () => {
    await tx(async () => {
      await run("reset role");
      await run("insert into public.assistant_drafts (charity_id, user_id, audience, subject, body) values ($1, $2, 'gave:this_month', 'Thank you', 'Thank you for giving this month.')", [ids.meals, ids.mealsAdmin]);
      await as(ids.mealsAdmin);
      await denied("select id from public.assistant_drafts");
      await denied("insert into public.assistant_drafts (charity_id, user_id, audience, subject, body) values ($1, $2, 'all', 'Hello', 'Written from the browser.')", [ids.meals, ids.mealsAdmin]);
      await as("anon");
      await denied("select id from public.assistant_drafts");
    });
  });

  it("expire after a few hours by default", async () => {
    await tx(async () => {
      await run("reset role");
      const r = await run("insert into public.assistant_drafts (charity_id, user_id, audience, subject, body) values ($1, $2, 'monthly', 'Thank you', 'Thank you for giving every month.') returning expires_at - created_at as left", [ids.meals, ids.mealsAdmin]);
      expect(String(r.rows[0].left.hours ?? r.rows[0].left)).toMatch(/6/);
    });
  });
});

describe("no new security-definer function", () => {
  it("adds none for these tables", async () => {
    const r = await run("select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and (p.prosrc ilike '%donor_messages%' or p.prosrc ilike '%assistant_drafts%')");
    expect(r.rows).toEqual([]);
  });
});
