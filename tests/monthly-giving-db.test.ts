/**
 * Monthly giving in the database: the stored card authorisation stays secret, the donor's
 * pause and cancel controls, and the consent record. Needs the local Supabase, seeded.
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
    admin: await one("select id from auth.users where email = $1", ["admin@nedivlev.test"]),
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
  await run("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: who, role: "authenticated", aal: "aal2", amr: [{ method: "otp", timestamp: 0 }] }),
  ]);
}
/** A monthly donation for the seeded donor, with a stored card authorisation. */
async function monthly(status = "active") {
  await run("reset role");
  const first = (
    await run(
      `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, contribution_cents,
         total_charged_cents, gateway, gateway_ref, status, paid_at, tax_year)
       values ($1, $2, 18000, 0, 0, 2000, 20000, 'test', gen_random_uuid()::text, 'paid', now(), 2027) returning id`,
      [ids.donor, ids.meals],
    )
  ).rows[0].id as string;
  const { rows } = await run(
    `insert into public.recurring_donations (donor_id, charity_id, amount_cents, contribution_cents, status, gateway, charge_day,
       first_donation_id, authorization_encrypted, card_last4, next_charge_at)
     values ($1, $2, 18000, 2000, $3::public.recurring_status, 'test', 15, $4, 'v1:secret-token', '4081', now() + interval '1 month') returning id`,
    [ids.donor, ids.meals, status, first],
  );
  return { id: rows[0].id as string, first };
}
const denied = async (sql: string, args: unknown[] = []) => {
  await run("savepoint p");
  await expect(run(sql, args)).rejects.toThrow(/permission denied/);
  await run("rollback to savepoint p");
};
let current = "";
const asWho = async (who: string) => {
  current = who;
  await as(who);
};
/** Look at the row as the server would (the authorisation is hidden from every signed-in role), then go back to the current person. */
const status = async (id: string) => {
  await run("reset role");
  const row = (await run("select status, authorization_encrypted, needs_gateway_sync, ended_reason from public.recurring_donations where id = $1", [id])).rows[0];
  if (current) await as(current);
  return row;
};

describe("the stored card authorisation", () => {
  it("cannot be read by anyone signed in, not even its owner, a platform admin or the charity", async () => {
    await tx(async () => {
      const { id } = await monthly();
      for (const who of [ids.donorUser, ids.admin, ids.mealsAdmin]) {
        await as(who);
        await denied("select authorization_encrypted from public.recurring_donations where id = $1", [id]);
        await denied("select * from public.recurring_donations where id = $1", [id]);
      }
    });
  });

  it("the rest of the monthly donation is readable by its owner, and only by its owner", async () => {
    await tx(async () => {
      const { id } = await monthly();
      await as(ids.donorUser);
      const mine = await run("select status, card_last4, charge_day, contribution_cents from public.recurring_donations where id = $1", [id]);
      expect(mine.rows).toEqual([{ status: "active", card_last4: "4081", charge_day: 15, contribution_cents: "2000" }]);
      await as(ids.mealsAdmin);
      expect((await run("select id from public.recurring_donations where id = $1", [id])).rows).toHaveLength(0);
    });
  });

  it("no client can change it or the schedule", async () => {
    await tx(async () => {
      const { id } = await monthly();
      await as(ids.donorUser);
      await denied("update public.recurring_donations set authorization_encrypted = 'x' where id = $1", [id]);
      await denied("update public.recurring_donations set next_charge_at = now() where id = $1", [id]);
      await denied("insert into public.recurring_donations (donor_id, charity_id, amount_cents) values ($1, $2, 100)", [ids.donor, ids.meals]);
    });
  });
});

describe("pausing, resuming and cancelling", () => {
  const change = (id: string, to: string) => run("select public.set_my_recurring_status($1, $2)", [id, to]);

  it("takes effect at once, with nothing waiting for the payment provider", async () => {
    await tx(async () => {
      const { id } = await monthly();
      await asWho(ids.donorUser);
      await change(id, "paused");
      expect(await status(id)).toMatchObject({ status: "paused", needs_gateway_sync: false });
      await change(id, "active");
      expect(await status(id)).toMatchObject({ status: "active", needs_gateway_sync: false });
    });
  });

  it("cancelling destroys the stored card authorisation, for good", async () => {
    await tx(async () => {
      const { id } = await monthly();
      await asWho(ids.donorUser);
      await change(id, "cancelled");
      expect(await status(id)).toMatchObject({ status: "cancelled", authorization_encrypted: null, ended_reason: "cancelled by the donor" });
      await expect(change(id, "active")).rejects.toThrow(/cannot be set to/);
    });
  });

  it("a monthly donation that failed can be cancelled but not resumed", async () => {
    await tx(async () => {
      const { id } = await monthly("failed");
      await asWho(ids.donorUser);
      await run("savepoint p");
      await expect(change(id, "active")).rejects.toThrow(/cannot be set to/);
      await run("rollback to savepoint p");
      await change(id, "cancelled");
      expect((await status(id)).status).toBe("cancelled");
    });
  });

  it("one still waiting for its first payment can be cancelled but not paused", async () => {
    await tx(async () => {
      const { id } = await monthly("pending");
      await as(ids.donorUser);
      await run("savepoint p");
      await expect(change(id, "paused")).rejects.toThrow(/cannot be set to/);
      await run("rollback to savepoint p");
      await change(id, "cancelled");
    });
  });

  it("nobody else can change it", async () => {
    await tx(async () => {
      const { id } = await monthly();
      for (const who of [ids.mealsAdmin, ids.admin]) {
        await as(who);
        await run("savepoint p");
        await expect(change(id, "cancelled")).rejects.toThrow(/not found/);
        await run("rollback to savepoint p");
      }
      current = "";
      expect((await status(id)).status).toBe("active");
    });
  });
});

describe("the donor's authorisation to collect monthly", () => {
  it("is recorded against the first donation, and needs one", async () => {
    await tx(async () => {
      const { first } = await monthly();
      await run("insert into public.consents (kind, policy_version, donation_id) values ('monthly_authorisation', '2026-10', $1)", [first]);
      await run("savepoint p");
      await expect(run("insert into public.consents (kind, policy_version) values ('monthly_authorisation', '2026-10')")).rejects.toThrow(/consent_has_subject/);
      await run("rollback to savepoint p");
    });
  });

  it("is a record the donor's own sign-in cannot read or change (donation consents have no user)", async () => {
    await tx(async () => {
      const { first } = await monthly();
      await run("insert into public.consents (kind, policy_version, donation_id) values ('monthly_authorisation', '2026-10', $1)", [first]);
      await as(ids.donorUser);
      expect((await run("select id from public.consents where kind = 'monthly_authorisation'")).rows).toHaveLength(0);
      await denied("insert into public.consents (kind, policy_version, donation_id) values ('monthly_authorisation', '2026-10', $1)", [first]);
    });
  });
});
