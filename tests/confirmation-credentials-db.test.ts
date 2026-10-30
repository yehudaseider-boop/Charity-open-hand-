/**
 * The confirmation credentials table: no client can read it, and the donor's
 * private choice stays unreadable to the receiving charity's admin.
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
    donorUser: await one("select id from auth.users where email = $1", ["donor@nedivlev.test"]),
    donor: await one("select id from public.donors where email = $1", ["donor@nedivlev.test"]),
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
async function as(who: "anon" | string) {
  await run("reset role");
  if (who === "anon") {
    await run("set local role anon");
    await run(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
  } else {
    await run("set local role authenticated");
    await run("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: who, role: "authenticated", aal: "aal2", amr: [{ method: "otp", timestamp: 0 }] }),
    ]);
  }
}
async function paidDonationWithCredential() {
  await run("reset role");
  const { rows } = await run(
    `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, contribution_cents,
       total_charged_cents, gateway, gateway_ref, status, paid_at, tax_year)
     values ($1, $2, 18000, 0, 0, 2345, 20345, 'test', gen_random_uuid()::text, 'paid', now(), 2027) returning id`,
    [ids.donor, ids.meals],
  );
  const id = rows[0].id as string;
  await run("insert into public.donation_giving_kinds (donation_id, kind) values ($1, 'maaser')", [id]);
  await run("insert into public.donation_confirmations (donation_id, token_hash) values ($1, repeat('a', 64))", [id]);
  return id;
}

describe("confirmation credentials and private choice", () => {
  it("nobody but the server can read the credentials table", async () => {
    await tx(async () => {
      await paidDonationWithCredential();
      for (const who of ["anon", ids.donorUser, ids.mealsAdmin, ids.hallAdmin]) {
        await as(who);
        await run("savepoint p");
        await expect(run("select * from public.donation_confirmations")).rejects.toThrow(/permission denied/);
        await run("rollback to savepoint p");
      }
    });
  });

  it("nobody but the server can write to it", async () => {
    await tx(async () => {
      const id = await paidDonationWithCredential();
      for (const who of ["anon", ids.donorUser, ids.mealsAdmin]) {
        await as(who);
        await run("savepoint p");
        await expect(run("update public.donation_confirmations set token_hash = repeat('b', 64) where donation_id = $1", [id])).rejects.toThrow(/permission denied/);
        await run("rollback to savepoint p");
      }
    });
  });

  it("stores only a 64-character hash, never a short token", async () => {
    await tx(async () => {
      const id = await paidDonationWithCredential();
      await run("savepoint p");
      await expect(run("update public.donation_confirmations set token_hash = 'plain-token' where donation_id = $1", [id])).rejects.toThrow(/check constraint/);
      await run("rollback to savepoint p");
    });
  });

  it("the receiving charity's admin cannot read the donor's choice or the donation base row", async () => {
    await tx(async () => {
      const id = await paidDonationWithCredential();
      await as(ids.mealsAdmin);
      expect((await run("select * from public.donation_giving_kinds where donation_id = $1", [id])).rows).toHaveLength(0);
      expect((await run("select * from public.donations where id = $1", [id])).rows).toHaveLength(0);
    });
  });

  it("an unrelated signed-in user and an anonymous visitor cannot read them either", async () => {
    await tx(async () => {
      const id = await paidDonationWithCredential();
      await as(ids.hallAdmin);
      expect((await run("select * from public.donation_giving_kinds where donation_id = $1", [id])).rows).toHaveLength(0);
      expect((await run("select * from public.donations where id = $1", [id])).rows).toHaveLength(0);
      await as("anon");
      await run("savepoint p");
      await expect(run("select * from public.donation_giving_kinds where donation_id = $1", [id])).rejects.toThrow(/permission denied/);
      await run("rollback to savepoint p");
    });
  });

  it("the donor can read their own", async () => {
    await tx(async () => {
      const id = await paidDonationWithCredential();
      await as(ids.donorUser);
      expect((await run("select kind from public.donation_giving_kinds where donation_id = $1", [id])).rows).toEqual([{ kind: "maaser" }]);
      expect((await run("select contribution_cents from public.donations where id = $1", [id])).rows).toHaveLength(1);
    });
  });
});
