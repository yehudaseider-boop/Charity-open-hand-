/**
 * Charity insights: new and returning donors, repeat donors and monthly donors, for the charity's own
 * admins only. Needs the local Supabase, seeded.
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
    mealsAdmin: await one("select id from auth.users where email = $1", ["meals.admin@nedivlev.test"]),
    hallAdmin: await one("select id from auth.users where email = $1", ["hall.admin@nedivlev.test"]),
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
async function as(who: string) {
  await run("reset role");
  await run("set local role authenticated");
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated", aal: "aal2" })]);
}
const donor = async (email: string) =>
  (await run("insert into public.donors (email, donor_type, first_name, last_name, age_confirmed_18_at, popia_consent_at) values ($1, 'individual', 'A', 'B', now(), now()) returning id", [email])).rows[0].id as string;
const gift = (d: string, paidAt: string, status = "paid") =>
  run(
    `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, contribution_cents,
       total_charged_cents, gateway, gateway_ref, status, paid_at, tax_year)
     values ($1, $2, 18000, 0, 0, 0, 18000, 'test', gen_random_uuid()::text, $3::text::public.donation_status, $4::timestamptz, 2027)`,
    [d, ids.meals, status, paidAt],
  );
const insights = () =>
  run("select new_donors::int n, returning_donors::int r, repeat_donors::int rep, all_donors::int a, monthly_active::int m from public.charity_insights($1, '2026-10-01T00:00:00+02', '2026-11-01T00:00:00+02')", [ids.meals]);

describe("charity insights", () => {
  it("counts new, returning and repeat donors from paid gifts only", async () => {
    await tx(async () => {
      await as(ids.mealsAdmin);
      const base = (await insights()).rows[0];
      await run("reset role");
      const newOne = await donor("new@insights.test");
      const back = await donor("back@insights.test");
      const failed = await donor("failed@insights.test");
      await gift(newOne, "2026-10-05T10:00:00+02");
      await gift(back, "2026-08-05T10:00:00+02");
      await gift(back, "2026-10-06T10:00:00+02");
      await gift(failed, "2026-10-07T10:00:00+02", "failed");
      await as(ids.mealsAdmin);
      const r = (await insights()).rows[0];
      expect(r.n - base.n).toBe(1);
      expect(r.r - base.r).toBe(1);
      expect(r.rep - base.rep).toBe(1);
      expect(r.a - base.a).toBe(2);
    });
  });

  it("is closed to other charities' admins", async () => {
    await tx(async () => {
      await as(ids.hallAdmin);
      await expect(insights()).rejects.toThrow(/Not allowed/);
    });
  });
});
