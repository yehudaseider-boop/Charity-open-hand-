/**
 * The faster charity views (migration 20261119000001, 19/11/2026) keep exactly the old rules: a gift shows to its
 * charity's team after the second step and to a Givezy admin after the second step, never to anyone else; contact
 * details show only to roles with 'contact'; an erased donor's placeholder email shows to every team role; the receipt
 * views follow the same team rule. Fixtures are built in a transaction that is rolled back.
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

async function user(role: "user" | "platform_admin" = "user") {
  const { id } = await one("insert into auth.users (id, email, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated') returning id", [`v${stamp()}@x.test`]);
  if (role !== "user") await run("update public.profiles set role = $2 where id = $1", [id, role]);
  return id as string;
}
async function charity() {
  const { id } = await one(
    `insert into public.charities (slug, quickgive_code, name_en, legal_name_en, status) values ($1, $2, 'C', 'C NPC', 'approved') returning id`,
    [`v-${stamp()}`, `V${String(Date.now()).slice(-6)}${seq}`],
  );
  return id as string;
}
async function gift(c: string, email: string) {
  const { id: donor } = await one(`insert into public.donors (email, donor_type, popia_consent_at) values ($1, 'individual', now()) returning id`, [`dv${stamp()}@x.test`]);
  const { id } = await one(
    `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, total_charged_cents, gateway, gateway_ref, status, paid_at, tax_year)
     values ($1, $2, 10000::bigint, 0, 0, 10000::bigint, 'test', gen_random_uuid()::text, 'paid', now(), 2027) returning id`,
    [donor, c],
  );
  await run(`insert into public.donation_checkout_details (donation_id, donor_type, email, first_name, phone, city) values ($1, 'individual', $2, 'Thandi', '0821234567', 'Soweto')`, [id, email]);
  return id as string;
}
async function receipt(c: string) {
  const { id: donor } = await one(`insert into public.donors (email, donor_type, popia_consent_at) values ($1, 'individual', now()) returning id`, [`rv${stamp()}@x.test`]);
  const { id } = await one(
    `insert into public.s18a_receipts (charity_id, receipt_number, donor_id, tax_year, amount_cents, status, details) values ($1, 1, $2, 2027, 10000, 'issued', '{"receipt_reference":"T-1","donor":{"name":"Thandi"}}'::jsonb) returning id`,
    [c, donor],
  );
  return id as string;
}
/** A second receipt with one gift linked to it, for the receipt-gifts view. */
async function receiptWithGift(c: string) {
  const g = await gift(c, "linked@x.test");
  const { donor_id } = await one("select donor_id from public.donations where id = $1", [g]);
  const { id } = await one(
    `insert into public.s18a_receipts (charity_id, receipt_number, donor_id, tax_year, amount_cents, status, details) values ($1, 2, $2, 2027, 10000, 'issued', '{"receipt_reference":"T-2","donor":{"name":"Linked"}}'::jsonb) returning id`,
    [c, donor_id],
  );
  await run("insert into public.s18a_receipt_donations (receipt_id, donation_id) values ($1, $2)", [id, g]);
  return id as string;
}
const as = async (id: string, aal = "aal2") => {
  await run("set local role authenticated");
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated", aal, amr: [{ method: "otp" }] })]);
};
const reset = () => run("reset role");

describe("the faster charity views keep the same rules", () => {
  it("show a charity's gifts to its team after the second step, contact details only with 'contact', nothing to anyone else", async () => {
    await tx(async () => {
      const c = await charity();
      const other = await charity();
      const owner = await user();
      const viewer = await user();
      const stranger = await user();
      const admin = await user("platform_admin");
      await run("insert into public.charity_admins (charity_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'viewer'), ($4, $5, 'owner')", [c, owner, viewer, other, stranger]);
      await gift(c, "thandi@x.test");
      await gift(c, "gone@erased.invalid");
      await gift(other, "sipho@x.test");

      const rows = async () => (await run("select charity_id, email::text as email, phone, city from public.charity_donations where charity_id = any($1) order by email nulls last", [[c, other]])).rows;

      await as(owner);
      expect(await rows()).toEqual([
        { charity_id: c, email: "gone@erased.invalid", phone: "0821234567", city: "Soweto" },
        { charity_id: c, email: "thandi@x.test", phone: "0821234567", city: "Soweto" },
      ]);
      await reset();

      await as(viewer);
      expect(await rows()).toEqual([
        { charity_id: c, email: "gone@erased.invalid", phone: null, city: null },
        { charity_id: c, email: null, phone: null, city: null },
      ]);
      await reset();

      // Before the second step: nothing, even for the owner.
      await as(owner, "aal1");
      expect(await rows()).toEqual([]);
      await reset();

      // Another charity's owner sees only their own charity's gift.
      await as(stranger);
      expect((await rows()).map((r) => r.charity_id)).toEqual([other]);
      await reset();

      // A Givezy admin sees both charities' gifts after the second step, and nothing before it.
      await as(admin);
      expect((await rows()).length).toBe(3);
      await reset();
      await as(admin, "aal1");
      expect(await rows()).toEqual([]);
      await reset();
    });
  });

  it("stay fast when the contact columns are read: the team is checked once, not once per gift", async () => {
    await tx(async () => {
      const c = await charity();
      const owner = await user();
      await run("insert into public.charity_admins (charity_id, user_id, role) values ($1, $2, 'owner')", [c, owner]);
      const { id: donor } = await one(`insert into public.donors (email, donor_type, popia_consent_at) values ($1, 'individual', now()) returning id`, [`many${stamp()}@x.test`]);
      await run(
        `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, total_charged_cents, gateway, gateway_ref, status, paid_at, tax_year)
         select $1, $2, 10000::bigint, 0, 0, 10000::bigint, 'test', gen_random_uuid()::text, 'paid', now() - g * interval '1 minute', 2027 from generate_series(1, 3000) g`,
        [donor, c],
      );
      await as(owner);
      const started = Date.now();
      const { rowCount } = await run(
        "select id, email, phone, contact_person, address_line1, address_line2, suburb, city, postal_code from public.charity_donations where charity_id = $1 order by paid_at desc nulls last, created_at desc, id limit 25",
        [c],
      );
      const ms = Date.now() - started;
      await reset();
      expect(rowCount).toBe(25);
      // Checked once per gift per contact column, 3 000 gifts took well over 10 seconds; checked once, a few hundredths.
      expect(ms).toBeLessThan(3000);
    });
  });

  it("show s18A receipts, and the gifts on them, to the charity's team and Givezy admins only", async () => {
    await tx(async () => {
      const c = await charity();
      const member = await user();
      const stranger = await user();
      const admin = await user("platform_admin");
      await run("insert into public.charity_admins (charity_id, user_id, role) values ($1, $2, 'viewer')", [c, member]);
      await receipt(c);
      const linked = await receiptWithGift(c);
      /** [receipts seen for the charity, gifts seen on the linked receipt] */
      const seen = async () => [
        Number((await one("select count(*)::int as n from public.charity_receipts where charity_id = $1", [c])).n),
        Number((await one("select count(*)::int as n from public.charity_receipt_donations where receipt_id = $1", [linked])).n),
      ];
      await as(member);
      expect(await seen()).toEqual([2, 1]);
      await reset();
      await as(stranger);
      expect(await seen()).toEqual([0, 0]);
      await reset();
      await as(admin);
      expect(await seen()).toEqual([2, 1]);
      await reset();
      await as(member, "aal1");
      expect(await seen()).toEqual([0, 0]);
      await reset();
    });
  });
});
