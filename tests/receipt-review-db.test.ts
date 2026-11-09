/**
 * The charity's check of each s18A receipt in the database (20261110000001_receipt_review.sql): decisions are
 * server-only, and correct_receipt_donor_details() changes only the name and street address of one charity's
 * paid s18A gifts of the year, never an amount, ID or tax number, registration number, email or s18A identity,
 * and never once a gift is on an issued receipt. Builds its own fixtures in a transaction that is rolled back.
 * Needs the local Supabase. Run: npm test
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
beforeAll(() => client.connect());
afterAll(() => client.end());
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
const one = async (sql: string, args: unknown[] = []) => (await run(sql, args)).rows[0];
async function tx(fn: () => Promise<void>) {
  await run("begin");
  try {
    await fn();
  } finally {
    await run("rollback");
  }
}
async function refused(sql: string, args: unknown[], pattern: RegExp) {
  await run("savepoint attempt");
  await expect(run(sql, args)).rejects.toThrow(pattern);
  await run("rollback to savepoint attempt");
}

let seq = 0;
async function fixtures() {
  const n = ++seq;
  const stamp = String(Date.now()).slice(-6);
  const charity = (await one(
    `insert into public.charities (slug, quickgive_code, name_en, legal_name_en, status, is_s18a, s18a_reference, mandate_signed_at)
     values ($1, $2, 'Test', 'Test NPC', 'approved', true, 's18A/1', '2026-03-09T00:00:00+02:00') returning id`,
    [`rv-${n}-${stamp}`, `R${n}${stamp}`],
  )).id as string;
  const donor = (await one(`insert into public.donors (email, donor_type, age_confirmed_18_at, popia_consent_at) values ($1, 'individual', now(), now()) returning id`, [`rv${n}-${stamp}@x.test`])).id as string;
  const gift = async (o: { amount?: number; year?: number; charity?: string } = {}) => {
    const id = (await one(
      `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, total_charged_cents,
         gateway, gateway_ref, wants_18a, status, paid_at, tax_year)
       values ($1, $2, $3, 0, 0, $3, 'test', gen_random_uuid()::text, true, 'paid', '2026-10-01T10:00:00Z', $4) returning id`,
      [donor, o.charity ?? charity, o.amount ?? 50_000, o.year ?? 2027],
    )).id as string;
    await run(
      `insert into public.donation_checkout_details (donation_id, donor_type, email, first_name, last_name, id_number_encrypted, id_number_last4,
         receipt_identity, address_line1, city, postal_code)
       values ($1, 'individual', $2, 'Thandi', 'Mokona', 'enc', '9085', 'idfp', '5 Old Road', 'Johannesburg', '2192')`,
      [id, `rv${n}-${stamp}@x.test`],
    );
    return id;
  };
  return { charity, donor, gift };
}
const correct = (charity: string, year: number, rows: unknown) => run("select public.correct_receipt_donor_details($1, $2, $3::jsonb) as n", [charity, year, JSON.stringify(rows)]);
const fix = { last_name: "Mokoena", address_line1: "12 New Street" };

describe("correct_receipt_donor_details", () => {
  it("changes the name and street address on each gift, and nothing else", async () => {
    await tx(async () => {
      const f = await fixtures();
      const a = await f.gift(), b = await f.gift({ amount: 25_000 });
      const res = await correct(f.charity, 2027, [a, b].map((id) => ({ donation_id: id, expect: { last_name: "Mokona" }, set: fix })));
      expect(res.rows[0].n).toBe(2);
      const rows = (await run(
        `select c.last_name, c.first_name, c.address_line1, c.id_number_encrypted, c.id_number_last4, c.receipt_identity, c.email, d.amount_cents, d.paid_at
           from public.donation_checkout_details c join public.donations d on d.id = c.donation_id where c.donation_id = any($1::uuid[]) order by d.amount_cents`,
        [[a, b]],
      )).rows;
      expect(rows.map((r) => [r.last_name, r.first_name, r.address_line1, r.id_number_encrypted, r.id_number_last4, r.receipt_identity, Number(r.amount_cents)])).toEqual([
        ["Mokoena", "Thandi", "12 New Street", "enc", "9085", "idfp", 25_000],
        ["Mokoena", "Thandi", "12 New Street", "enc", "9085", "idfp", 50_000],
      ]);
    });
  });

  it("refuses any other column: an amount, an ID or tax number, the identity, the email", async () => {
    await tx(async () => {
      const f = await fixtures();
      const a = await f.gift();
      for (const col of ["amount_cents", "id_number_last4", "id_number_encrypted", "tax_reference_last4", "registration_number", "receipt_identity", "email", "donor_type"]) {
        await refused("select public.correct_receipt_donor_details($1, 2027, $2::jsonb)", [f.charity, JSON.stringify([{ donation_id: a, set: { [col]: "x" } }])], /receipt_details_column/);
        await refused("select public.correct_receipt_donor_details($1, 2027, $2::jsonb)", [f.charity, JSON.stringify([{ donation_id: a, expect: { [col]: "x" }, set: fix }])], /receipt_details_column/);
      }
    });
  });

  it("refuses once a gift is on an issued s18A receipt", async () => {
    await tx(async () => {
      const f = await fixtures();
      const a = await f.gift();
      await run("select * from public.issue_s18a_receipt($1, $2, 2027, $3::uuid[], 'RVW', '{}'::jsonb, 'idfp')", [f.charity, f.donor, [a]]);
      await refused("select public.correct_receipt_donor_details($1, 2027, $2::jsonb)", [f.charity, JSON.stringify([{ donation_id: a, set: fix }])], /receipt_details_issued/);
    });
  });

  it("refuses another charity's gift, another tax year, and a value changed since it was read", async () => {
    await tx(async () => {
      const f = await fixtures(), g = await fixtures();
      const mine = await f.gift(), theirs = await g.gift(), lastYear = await f.gift({ year: 2026 });
      await refused("select public.correct_receipt_donor_details($1, 2027, $2::jsonb)", [f.charity, JSON.stringify([{ donation_id: theirs, set: fix }])], /receipt_details_not_found/);
      await refused("select public.correct_receipt_donor_details($1, 2027, $2::jsonb)", [f.charity, JSON.stringify([{ donation_id: lastYear, set: fix }])], /receipt_details_not_found/);
      await refused("select public.correct_receipt_donor_details($1, 2027, $2::jsonb)", [f.charity, JSON.stringify([{ donation_id: mine, expect: { last_name: "Someone else" }, set: fix }])], /receipt_details_changed/);
    });
  });

  it("can't be called from a browser, not even by the charity's own admin", async () => {
    await tx(async () => {
      const f = await fixtures();
      const a = await f.gift();
      await run("set local role authenticated");
      await refused("select public.correct_receipt_donor_details($1, 2027, $2::jsonb)", [f.charity, JSON.stringify([{ donation_id: a, set: fix }])], /permission denied/);
      await run("set local role anon");
      await refused("select public.correct_receipt_donor_details($1, 2027, $2::jsonb)", [f.charity, JSON.stringify([{ donation_id: a, set: fix }])], /permission denied/);
    });
  });
});

describe("receipt_plan_decisions", () => {
  const insert = (charity: string, donor: string, decision = "approved", emailed: string | null = null) =>
    run(
      `insert into public.receipt_plan_decisions (charity_id, tax_year, donor_id, donor_identity, decision, certificate_fingerprint, decline_emailed_at)
       values ($1, 2027, $2, 'idfp', $3, $4, $5) returning id`,
      [charity, donor, decision, "a".repeat(64), emailed],
    );

  it("one decision per certificate; a decline email only on a decline", async () => {
    await tx(async () => {
      const f = await fixtures(), g = await fixtures();
      await insert(f.charity, f.donor);
      await run("savepoint p");
      await expect(insert(f.charity, f.donor, "declined")).rejects.toThrow(/duplicate key/);
      await run("rollback to savepoint p");
      await expect(insert(g.charity, g.donor, "approved", "2027-03-02T08:00:00Z")).rejects.toThrow(/receipt_decision_emailed/);
      await run("rollback to savepoint p");
      await expect(insert(g.charity, g.donor, "maybe")).rejects.toThrow(/receipt_decision_kind/);
    });
  });

  it("is server-only: no browser can read or write it", async () => {
    await tx(async () => {
      const f = await fixtures();
      await insert(f.charity, f.donor);
      const admin = await one("select id from auth.users where email = $1", ["meals.admin@nedivlev.test"]);
      await run("set local role authenticated");
      await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: admin.id, role: "authenticated", aal: "aal2" })]);
      await refused("select * from public.receipt_plan_decisions", [], /permission denied/);
      await refused("delete from public.receipt_plan_decisions", [], /permission denied/);
      await run("set local role anon");
      await refused("select * from public.receipt_plan_decisions", [], /permission denied/);
    });
  });

  it("has row-level security on", async () => {
    const r = await one("select relrowsecurity from pg_class where oid = 'public.receipt_plan_decisions'::regclass");
    expect(r.relrowsecurity).toBe(true);
  });
});
