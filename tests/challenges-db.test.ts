/**
 * Group challenges: only the server writes them, the public sees totals without who started or who gave,
 * a gift can only be for the same charity's challenge (and not also a campaign), the charity's admins and
 * the starter can read theirs, and one person runs at most five at once. Needs the local Supabase, seeded.
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
    donorUser: await one("select id from auth.users where email = $1", ["donor@nedivlev.test"]),
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
    await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated", aal: "aal2", amr: [{ method: "otp", timestamp: 0 }] })]);
  }
}
async function refused(sql: string, args: unknown[], pattern: RegExp) {
  await run("savepoint p");
  await expect(run(sql, args)).rejects.toThrow(pattern);
  await run("rollback to savepoint p");
}
const start = async (charity: string, slug: string, by: string | null = null) =>
  (await run("insert into public.group_challenges (slug, charity_id, started_by, starter_name, title, target_cents) values ($1, $2, $3, 'Sarah', 'Our office feeds 50 families', 1000000) returning id", [slug, charity, by])).rows[0].id as string;
const gift = (charity: string, challenge: string | null, cents: number, status = "paid", campaign: string | null = null) =>
  run(
    `insert into public.donations (donor_id, charity_id, challenge_id, campaign_id, amount_cents, platform_fee_cents, processing_charge_cents, contribution_cents,
       total_charged_cents, gateway, gateway_ref, status, paid_at, tax_year)
     values ($1, $2, $3, $6, $4::bigint, 0, 0, 1000, $4::bigint + 1000, 'test', gen_random_uuid()::text, $5::text::public.donation_status, case when $5::text = 'paid' then now() end, 2027)`,
    [ids.donor, charity, challenge, cents, status, campaign],
  );

describe("group challenges", () => {
  it("the public sees the total, gifts and people, never who started it; only paid gifts count", async () => {
    await tx(async () => {
      await run("reset role");
      const id = await start(ids.meals, "office-feeds-test01", ids.donorUser);
      await gift(ids.meals, id, 18000);
      await gift(ids.meals, id, 36000);
      await gift(ids.meals, id, 50000, "failed");
      await as("anon");
      const r = (await run("select * from public.challenge_public(p_slug => 'office-feeds-test01')")).rows[0];
      expect(Number(r.raised_cents)).toBe(54000);
      expect(Number(r.gift_count)).toBe(2);
      expect(Number(r.people)).toBe(1);
      expect(r.starter_name).toBe("Sarah");
      expect(Object.keys(r)).not.toContain("started_by");
      const running = (await run("select slug from public.challenge_public(p_charity_id => $1)", [ids.meals])).rows.map((x) => x.slug);
      expect(running).toContain("office-feeds-test01");
    });
  });

  it("nobody writes from the browser, and the table itself is closed to the public", async () => {
    await tx(async () => {
      await as("anon");
      await refused("select id from public.group_challenges", [], /permission denied/);
      await as(ids.donorUser);
      await refused("insert into public.group_challenges (slug, charity_id, starter_name, title, target_cents) values ('x-1', $1, 'A', 'Abc', 100000)", [ids.meals], /permission denied/);
    });
  });

  it("the charity's admins and the person who started it can read it; another charity can't", async () => {
    await tx(async () => {
      await run("reset role");
      await start(ids.meals, "office-feeds-test02", ids.donorUser);
      await as(ids.mealsAdmin);
      expect((await run("select slug from public.group_challenges where slug = 'office-feeds-test02'")).rows).toHaveLength(1);
      expect((await run("select count(*)::int as n from public.charity_challenges($1)", [ids.meals])).rows[0].n).toBeGreaterThan(0);
      await as(ids.donorUser);
      expect((await run("select slug from public.group_challenges where slug = 'office-feeds-test02'")).rows).toHaveLength(1);
      await as(ids.shulAdmin);
      expect((await run("select slug from public.group_challenges where slug = 'office-feeds-test02'")).rows).toHaveLength(0);
      await refused("select * from public.charity_challenges($1)", [ids.meals], /Not allowed/);
    });
  });

  it("a gift can only be for the same charity's challenge, and not also for a campaign", async () => {
    await tx(async () => {
      await run("reset role");
      const id = await start(ids.meals, "office-feeds-test03");
      await run("savepoint g");
      await expect(gift(ids.shul, id, 18000)).rejects.toThrow(/donations_challenge_same_charity/);
      await run("rollback to savepoint g");
      const camp = (await run("insert into public.campaigns (charity_id, slug, title, target_cents, status) values ($1, 'camp-x', 'Pesach food parcels', 5000000, 'active') returning id", [ids.meals])).rows[0].id;
      await run("savepoint h");
      await expect(gift(ids.meals, id, 18000, "paid", camp)).rejects.toThrow(/donations_one_target/);
      await run("rollback to savepoint h");
    });
  });

  it("one person runs at most five at once", async () => {
    await tx(async () => {
      await run("reset role");
      for (let i = 1; i <= 5; i++) await start(ids.meals, `limit-test-${i}`, ids.donorUser);
      await refused("insert into public.group_challenges (slug, charity_id, started_by, starter_name, title, target_cents) values ('limit-test-6', $1, $2, 'Sarah', 'One more go', 100000)", [ids.meals, ids.donorUser], /up to 5 challenges/);
    });
  });
});
