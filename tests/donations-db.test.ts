/**
 * Donation status rules in the database. Needs the local Supabase, seeded.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
let donor: string, meals: string, mealsAdmin: string, shulAdmin: string;

beforeAll(async () => {
  await client.connect();
  const one = async (sql: string) => (await client.query(sql)).rows[0].id as string;
  donor = await one("select id from public.donors where email = 'donor@openhand.test'");
  meals = await one("select id from public.charities where slug = 'northcliff-meals-fund'");
  mealsAdmin = await one("select id from auth.users where email = 'meals.admin@openhand.test'");
  shulAdmin = await one("select id from auth.users where email = 'shul.admin@openhand.test'");
});
afterAll(() => client.end());

async function tx(fn: () => Promise<void>) {
  await client.query("begin");
  try {
    await fn();
  } finally {
    await client.query("rollback");
  }
}
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);

async function pending(): Promise<string> {
  const { rows } = await run(
    `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents,
       total_charged_cents, gateway, gateway_ref)
     values ($1, $2, 3000, 90, 150, 3240, 'test', gen_random_uuid()::text) returning id`,
    [donor, meals],
  );
  return rows[0].id;
}
const markPaid = (id: string) =>
  run("update public.donations set status = 'paid', paid_at = now(), tax_year = 2027 where id = $1", [id]);

describe("donation status", () => {
  it("moves pending -> paid", async () => {
    await tx(async () => {
      const id = await pending();
      await markPaid(id);
    });
  });

  it("can't go back from paid to pending or failed", async () => {
    await tx(async () => {
      const id = await pending();
      await markPaid(id);
      await expect(run("update public.donations set status = 'pending' where id = $1", [id])).rejects.toThrow(
        /cannot move from paid to pending/,
      );
    });
  });

  it("can't jump from pending straight to refunded", async () => {
    await tx(async () => {
      const id = await pending();
      await expect(run("update public.donations set status = 'refunded' where id = $1", [id])).rejects.toThrow(
        /cannot move/,
      );
    });
  });

  it("freezes amounts once paid", async () => {
    await tx(async () => {
      const id = await pending();
      await markPaid(id);
      await expect(
        run(
          "update public.donations set amount_cents = 1, total_charged_cents = 1 + platform_fee_cents + processing_charge_cents where id = $1",
          [id],
        ),
      ).rejects.toThrow(/cannot change/);
    });
  });

  it("allows a late success after a failure (gateway retried)", async () => {
    await tx(async () => {
      const id = await pending();
      await run("update public.donations set status = 'failed' where id = $1", [id]);
      await markPaid(id);
    });
  });
});

describe("checkout details", () => {
  it("a charity admin reads them through the charity view, for their own charity only", async () => {
    await tx(async () => {
      const id = await pending();
      await run(
        "insert into public.donation_checkout_details (donation_id, donor_type, email, first_name) values ($1, 'individual', 'x@test.test', 'X')",
        [id],
      );
      await run("set local role authenticated");
      await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: mealsAdmin, role: "authenticated" })]);
      expect((await run("select * from public.charity_donations")).rowCount).toBe(1);
      expect((await run("select * from public.donation_checkout_details")).rowCount).toBe(0); // raw table is closed to charities
      await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: shulAdmin, role: "authenticated" })]);
      expect((await run("select * from public.charity_donations")).rowCount).toBe(0);
    });
  });
});
