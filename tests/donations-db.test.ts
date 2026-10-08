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
  donor = await one("select id from public.donors where email = 'donor@nedivlev.test'");
  meals = await one("select id from public.charities where slug = 'northcliff-meals-fund'");
  mealsAdmin = await one("select id from auth.users where email = 'meals.admin@nedivlev.test'");
  shulAdmin = await one("select id from auth.users where email = 'shul.admin@nedivlev.test'");
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
      const unpaid = await pending();
      const id = await pending();
      for (const d of [unpaid, id]) {
        await run(
          "insert into public.donation_checkout_details (donation_id, donor_type, email, first_name) values ($1, 'individual', 'x@test.test', 'X')",
          [d],
        );
      }
      await markPaid(id);
      await run("set local role authenticated");
      await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: mealsAdmin, role: "authenticated", aal: "aal2" })]);
      // Only the paid donation: people who abandoned checkout stay private.
      expect((await run("select id from public.charity_donations")).rows.map((r) => r.id)).toEqual([id]);
      expect((await run("select * from public.donation_checkout_details")).rowCount).toBe(0); // raw table is closed to charities
      await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: shulAdmin, role: "authenticated", aal: "aal2" })]);
      expect((await run("select * from public.charity_donations")).rowCount).toBe(0);
    });
  });
});

describe("NEDIV lev contribution line", () => {
  const insert = (amount: number, contribution: number, total: number) =>
    run(
      `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents,
         contribution_cents, total_charged_cents, gateway, gateway_ref)
       values ($1, $2, $3, 0, 0, $4, $5, 'test', gen_random_uuid()::text) returning id`,
      [donor, meals, amount, contribution, total],
    );

  it("records the contribution separately and the total must add up", async () => {
    await tx(async () => {
      const { rows } = await insert(3000, 1000, 4000);
      expect((await run("select amount_cents, contribution_cents from public.donations where id = $1", [rows[0].id])).rows[0])
        .toEqual({ amount_cents: "3000", contribution_cents: "1000" });
    });
    await tx(async () => {
      await expect(insert(3000, 1000, 3000)).rejects.toThrow(/split_adds_up/);
    });
    await tx(async () => {
      await expect(insert(3000, -1, 2999)).rejects.toThrow(/contribution_cents/);
    });
  });

  it("can't change the contribution once paid", async () => {
    await tx(async () => {
      const { rows } = await insert(3000, 1000, 4000);
      await markPaid(rows[0].id);
      await expect(
        run("update public.donations set contribution_cents = 0, total_charged_cents = 3000 where id = $1", [rows[0].id]),
      ).rejects.toThrow(/cannot change/);
    });
  });
});

describe("second step (authenticator code) in the database", () => {
  it("gives an admin who only used the emailed link no admin rights", async () => {
    await tx(async () => {
      const id = await pending();
      await markPaid(id);
      const admin = (await run("select id from auth.users where email = 'admin@nedivlev.test'")).rows[0].id;
      await run("set local role authenticated");
      for (const [who, aal] of [[mealsAdmin, "aal1"], [admin, "aal1"], [mealsAdmin, undefined]] as const) {
        await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated", aal })]);
        expect((await run("select id from public.charity_donations")).rowCount).toBe(0);
        expect((await run("select charity_id from public.charity_private")).rowCount).toBe(0);
        expect((await run("select public.is_charity_admin($1) as ok", [meals])).rows[0].ok).toBe(false);
      }
      // A platform admin without the code can't approve or badge a charity.
      await run("reset role");
      const before = (await run("select is_verified from public.charities where id = $1", [meals])).rows[0].is_verified;
      await run("set local role authenticated");
      await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: admin, role: "authenticated", aal: "aal1" })]);
      await run("savepoint try_update");
      let refused = false;
      try {
        const r = await run("update public.charities set is_verified = not is_verified where id = $1", [meals]);
        refused = r.rowCount === 0;
      } catch {
        refused = true;
        await run("rollback to savepoint try_update");
      }
      expect(refused).toBe(true);
      await run("reset role");
      expect((await run("select is_verified from public.charities where id = $1", [meals])).rows[0].is_verified).toBe(before);
    });
  });
});
