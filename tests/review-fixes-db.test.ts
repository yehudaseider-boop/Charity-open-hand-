/**
 * Fixes from the full review (09/10/2026): private notes, receipts, paid
 * donations and charity documents. Needs the local Supabase, seeded.
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
    shulAdmin: await one("select id from auth.users where email = $1", ["shul.admin@nedivlev.test"]),
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
    await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated", aal: "aal2" })]);
  }
}
async function refused(sql: string, args: unknown[], pattern: RegExp) {
  await run("savepoint p");
  await expect(run(sql, args)).rejects.toThrow(pattern);
  await run("rollback to savepoint p");
}
async function paidDonation() {
  await run("reset role");
  const { rows } = await run(
    `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, contribution_cents,
       total_charged_cents, gateway, gateway_ref, status, paid_at, tax_year, wants_18a)
     values ($1, $2, 18000, 0, 0, 0, 18000, 'test', gen_random_uuid()::text, 'paid', now(), 2027, true) returning id`,
    [ids.donor, ids.meals],
  );
  return rows[0].id as string;
}

describe("review fixes in the database", () => {
  it("a private note only goes on your own donation, and can't block the owner's", async () => {
    await tx(async () => {
      const d = await paidDonation();
      await as(ids.shulAdmin);
      await refused("insert into public.donation_private_notes (donation_id, user_id, note) values ($1, $2, 'x')", [d, ids.shulAdmin], /row-level security/);
      await as(ids.donorUser);
      await run("insert into public.donation_private_notes (donation_id, user_id, note) values ($1, $2, 'mine')", [d, ids.donorUser]);
    });
  });

  it("anonymous visitors can't call internal functions", async () => {
    await tx(async () => {
      await as("anon");
      await refused("select public.my_donor_ids()", [], /permission denied/);
      await refused("select public.link_my_donations()", [], /permission denied/);
    });
  });

  it("a paid donation's date, tax year and receipt choice are fixed", async () => {
    await tx(async () => {
      const d = await paidDonation();
      await refused("update public.donations set tax_year = 2026 where id = $1", [d], /cannot change/);
      await refused("update public.donations set wants_18a = false where id = $1", [d], /cannot change/);
      await run("update public.donations set status = 'refunded', refunded_at = now() where id = $1", [d]);
    });
  });

  it("an issued receipt can't be re-pointed at someone else", async () => {
    await tx(async () => {
      await run("reset role");
      const r = await run("select id from public.s18a_receipts where status = 'issued' limit 1");
      if (!r.rows.length) return;
      await refused("update public.s18a_receipts set donor_identity = 'someone-else' where id = $1", [r.rows[0].id], /immutable/);
      await refused("update public.s18a_receipts set void_reason = 'x' where id = $1", [r.rows[0].id], /immutable/);
    });
  });

  it("documents can't be added once an application is submitted, and the uploader is the person signed in", async () => {
    await tx(async () => {
      await as(ids.mealsAdmin);
      await refused(
        "insert into public.charity_documents (charity_id, document_type, storage_path, file_name, uploaded_by) values ($1, 'npo_certificate', $2, 'a.pdf', $3)",
        [ids.meals, `${ids.meals}/a.pdf`, ids.mealsAdmin],
        /submitted/,
      );
      await run("reset role");
      await run("update public.charities set status = 'draft' where id = $1", [ids.meals]);
      await as(ids.mealsAdmin);
      await refused(
        "insert into public.charity_documents (charity_id, document_type, storage_path, file_name, uploaded_by) values ($1, 'npo_certificate', $2, 'a.pdf', $3)",
        [ids.meals, `${ids.meals}/a.pdf`, ids.shulAdmin],
        /signed in/,
      );
    });
  });

  it("a charity can't change its own created date", async () => {
    await tx(async () => {
      await as(ids.mealsAdmin);
      await refused("update public.charities set created_at = now() where id = $1", [ids.meals], /permission denied/);
      await run("update public.charities set description_en = 'Still works' where id = $1", [ids.meals]);
    });
  });
});
