/**
 * Part refunds in the charity's totals (migration 20261120000003, code review 20/11/2026). A R1 000 gift refunded
 * R400 counts R600 on the dashboard, as on its s18A receipt, with R400 refunded; a gift refunded in full in parts
 * (still 'paid' because the donor also gave a contribution) counts as a refund, not a gift, and its donor isn't a
 * donor. Read as a charity owner with the second step done. Fixtures are built in a transaction that is rolled back.
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

let seq = 0;
const stamp = () => `${++seq}-${Date.now()}`;
async function user() {
  const { id } = await one("insert into auth.users (id, email, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated') returning id", [`prt${stamp()}@x.test`]);
  return id as string;
}
async function charity() {
  const { id } = await one(
    `insert into public.charities (slug, quickgive_code, name_en, legal_name_en, status, is_s18a, s18a_reference, mandate_signed_at)
     values ($1, $2, 'Test', 'Test NPC', 'approved', true, 's18A/1', '2026-03-09T00:00:00+02:00') returning id`,
    [`prt-${stamp()}`, `T${seq}${String(Date.now()).slice(-5)}`],
  );
  return id as string;
}
async function donor() {
  const { id } = await one(`insert into public.donors (email, donor_type, age_confirmed_18_at, popia_consent_at) values ($1, 'individual', now(), now()) returning id`, [`prt${stamp()}@x.test`]);
  return id as string;
}
/** A paid gift on 01/10/2026 with an s18A receipt asked for, and the donor's details. */
async function gift(c: string, d: string, amount: number, contribution = 0) {
  const { id } = await one(
    `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, contribution_cents, total_charged_cents,
       gateway, gateway_ref, wants_18a, status, paid_at, tax_year)
     values ($1, $2, $3::bigint, 0, 0, $4::bigint, $3::bigint + $4::bigint, 'test', gen_random_uuid()::text, true, 'paid', '2026-10-01T10:00:00Z', 2027) returning id`,
    [d, c, amount, contribution],
  );
  await run(`insert into public.donation_checkout_details (donation_id, donor_type, email, first_name, last_name) values ($1, 'individual', $2, 'Thandi', 'Mokoena')`, [id, `prt${stamp()}@x.test`]);
  return id as string;
}
const refund = async (id: string, cents: number, source: string) =>
  (await one("select public.record_partial_refund($1, $2::bigint, $3) as outcome", [id, cents, source])).outcome as string;
const as = async (id: string) => {
  await run("set local role authenticated");
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated", aal: "aal2", amr: [{ method: "otp" }] })]);
};
const ALL_TIME = ["2000-01-01T00:00:00+02:00", "2100-01-01T00:00:00+02:00"];

/** A charity with R1 000 refunded R400 (Ann) and R500 plus a R50 contribution refunded in full in parts (Ben). */
async function setUp() {
  const c = await charity(), owner = await user();
  await run("insert into public.charity_admins (charity_id, user_id, role) values ($1, $2, 'owner')", [c, owner]);
  const ann = await donor(), ben = await donor();
  const a = await gift(c, ann, 100_000);
  const b = await gift(c, ben, 50_000, 5_000);
  expect(await refund(a, 40_000, `gateway_event:${stamp()}`)).toBe("done");
  expect(await refund(b, 30_000, `gateway_event:${stamp()}`)).toBe("done");
  expect(await refund(b, 20_000, `admin:${stamp()}`)).toBe("done");
  // Ben's gift stays paid: the contribution was charged too, so it isn't flipped to refunded.
  expect((await one("select status from public.donations where id = $1", [b])).status).toBe("paid");
  return { c, owner, ann, ben, a, b };
}

describe("part refunds in the charity's totals", () => {
  it("the overview counts R600 received from one gift and one donor, and R900 refunded", async () => {
    await tx(async () => {
      const { c, owner } = await setUp();
      await as(owner);
      const o = await one("select * from public.charity_overview($1, $2, $3)", [c, ...ALL_TIME]);
      expect(Number(o.paid_count)).toBe(1);
      expect(Number(o.paid_cents)).toBe(60_000);
      expect(Number(o.donor_count)).toBe(1);
      expect(Number(o.receipt_requested_cents)).toBe(60_000);
      // Ben's gift refunded in full in parts is a refund; Ann's R400 part refund is in the refunded cents.
      expect(Number(o.refunded_count)).toBe(1);
      expect(Number(o.refunded_cents)).toBe(90_000);
    });
  });

  it("the month counts what is left, and not the gift refunded in full in parts", async () => {
    await tx(async () => {
      const { c, owner } = await setUp();
      await as(owner);
      const rows = (await run("select * from public.charity_monthly_totals($1, 12)", [c])).rows;
      expect(rows).toHaveLength(1);
      expect(String(rows[0].month instanceof Date ? rows[0].month.toISOString().slice(0, 7) : rows[0].month).slice(0, 7)).toBe("2026-10");
      expect(Number(rows[0].donation_count)).toBe(1);
      expect(Number(rows[0].amount_cents)).toBe(60_000);
      expect(Number(rows[0].monthly_cents)).toBe(0);
    });
  });

  it("the donor list has Ann at R600 from one gift, and not Ben", async () => {
    await tx(async () => {
      const { c, owner, ann } = await setUp();
      await as(owner);
      const rows = (await run("select donor_id, donation_count, total_cents from public.charity_donor_list($1)", [c])).rows;
      expect(rows.map((r) => [r.donor_id, Number(r.donation_count), Number(r.total_cents)])).toEqual([[ann, 1, 60_000]]);
      const insights = await one("select * from public.charity_insights($1, $2, $3)", [c, ...ALL_TIME]);
      expect(Number(insights.all_donors)).toBe(1);
    });
  });

  it("the charity's view of its gifts carries what was refunded in parts, as its last column", async () => {
    await tx(async () => {
      const { c, owner, a, b } = await setUp();
      await as(owner);
      const rows = (await run("select id, amount_cents, refunded_cents from public.charity_donations where charity_id = $1", [c])).rows;
      const byId = new Map(rows.map((r) => [r.id, [Number(r.amount_cents), Number(r.refunded_cents)]]));
      expect(byId.get(a)).toEqual([100_000, 40_000]);
      expect(byId.get(b)).toEqual([50_000, 50_000]);
      await run("reset role");
      const last = await one(
        "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'charity_donations' order by ordinal_position desc limit 1",
      );
      expect(last.column_name).toBe("refunded_cents");
    });
  });

  it("a campaign's raised total is what is left", async () => {
    await tx(async () => {
      const { c, a, b } = await setUp();
      const { id: camp } = await one("insert into public.campaigns (charity_id, title, slug, status) values ($1, 'Winter blankets', $2, 'active') returning id", [c, `w-${stamp()}`]);
      await run("update public.donations set campaign_id = $1 where id = any($2::uuid[])", [camp, [a, b]]);
      const p = await one("select * from public.campaign_progress($1::uuid[])", [[camp]]);
      expect(Number(p.raised_cents)).toBe(60_000);
      expect(Number(p.gift_count)).toBe(1);
    });
  });
});
