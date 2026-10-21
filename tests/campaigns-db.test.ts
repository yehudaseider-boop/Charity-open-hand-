/**
 * Campaigns: a charity's own admins start and end them, the public sees active ones with their running
 * total, a gift can only be for the same charity's campaign, and a charity runs at most three at once.
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
  const one = async (sql: string, a: unknown[]) => (await run(sql, a)).rows[0].id as string;
  ids = {
    donor: await one("select id from public.donors where email = $1", ["donor@nedivlev.test"]),
    mealsAdmin: await one("select id from auth.users where email = $1", ["meals.admin@nedivlev.test"]),
    shulAdmin: await one("select id from auth.users where email = $1", ["shul.admin@nedivlev.test"]),
    meals: await one("select id from public.charities where slug = $1", ["northcliff-meals-fund"]),
    shul: await one("select id from public.charities where slug = $1", ["glenhazel-shul-fund"]),
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
    await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated", aal: "aal2" })]);
  }
}
async function refused(sql: string, args: unknown[], pattern: RegExp) {
  await run("savepoint p");
  await expect(run(sql, args)).rejects.toThrow(pattern);
  await run("rollback to savepoint p");
}
const start = (charity: string, slug: string, status = "active") =>
  run("insert into public.campaigns (charity_id, slug, title, target_cents, status) values ($1, $2, 'Pesach food parcels', 5000000, $3) returning id", [charity, slug, status]);
const gift = (charity: string, campaign: string | null, cents: number, status = "paid") =>
  run(
    `insert into public.donations (donor_id, charity_id, campaign_id, amount_cents, platform_fee_cents, processing_charge_cents, contribution_cents,
       total_charged_cents, gateway, gateway_ref, status, paid_at, tax_year)
     values ($1, $2, $3, $4::bigint, 0, 0, 1000, $4::bigint + 1000, 'test', gen_random_uuid()::text, $5::text::public.donation_status, case when $5::text = 'paid' then now() end, 2027) returning id`,
    [ids.donor, charity, campaign, cents, status],
  );

describe("campaigns", () => {
  it("the charity's admin starts one; the public sees it and its total of paid gifts only, never the contribution", async () => {
    await tx(async () => {
      await as(ids.mealsAdmin);
      const c = (await start(ids.meals, "pesach")).rows[0].id as string;
      await run("reset role");
      await gift(ids.meals, c, 18_000);
      await gift(ids.meals, c, 36_000);
      await gift(ids.meals, c, 50_000, "refunded");
      await as("anon");
      expect((await run("select title from public.campaigns where id = $1", [c])).rows).toHaveLength(1);
      const p = (await run("select raised_cents::int as r, gift_count::int as n from public.campaign_progress($1)", [[c]])).rows[0];
      expect(p).toEqual({ r: 54_000, n: 2 });
    });
  });

  it("keeps drafts private and refuses other charities' admins and the public", async () => {
    await tx(async () => {
      await as(ids.mealsAdmin);
      const draft = (await start(ids.meals, "draft-one", "draft")).rows[0].id as string;
      await as("anon");
      expect((await run("select id from public.campaigns where id = $1", [draft])).rows).toHaveLength(0);
      expect((await run("select * from public.campaign_progress($1)", [[draft]])).rows).toHaveLength(0);
      await refused("insert into public.campaigns (charity_id, slug, title) values ($1, 'x', 'Not mine')", [ids.meals], /permission denied|row-level security/);
      await as(ids.shulAdmin);
      await refused("insert into public.campaigns (charity_id, slug, title) values ($1, 'x', 'Not mine')", [ids.meals], /row-level security/);
      expect((await run("update public.campaigns set status = 'ended' where id = $1 returning id", [draft])).rows).toHaveLength(0);
    });
  });

  it("a gift can't be for another charity's campaign", async () => {
    await tx(async () => {
      const c = (await start(ids.meals, "pesach")).rows[0].id as string;
      await run("savepoint p");
      await expect(gift(ids.shul, c, 18_000)).rejects.toThrow(/donations_campaign_same_charity/);
      await run("rollback to savepoint p");
    });
  });

  it("runs at most three campaigns at a time; an ended one makes room", async () => {
    await tx(async () => {
      for (const s of ["a", "b", "c"]) await start(ids.meals, s);
      await run("savepoint p");
      await expect(start(ids.meals, "d")).rejects.toThrow(/up to 3 campaigns/);
      await run("rollback to savepoint p");
      await run("update public.campaigns set status = 'ended' where charity_id = $1 and slug = 'a'", [ids.meals]);
      await start(ids.meals, "d");
      await run("savepoint q");
      await expect(run("update public.campaigns set status = 'active' where charity_id = $1 and slug = 'a'", [ids.meals])).rejects.toThrow(/up to 3 campaigns/);
      await run("rollback to savepoint q");
    });
  });

  it("a campaign past its last day no longer takes one of the three places", async () => {
    await tx(async () => {
      for (const s of ["a", "b", "c"]) await start(ids.meals, s);
      await run("update public.campaigns set ends_at = now() - interval '1 day' where charity_id = $1 and slug = 'a'", [ids.meals]);
      await start(ids.meals, "d");
    });
  });
});
