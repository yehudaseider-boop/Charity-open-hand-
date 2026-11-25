/**
 * The three charity views read past row-level security (they run as their owner), so their own filter is the only
 * thing between one charity and another charity's donations and receipts (security check of 24/11/2026; follow-up
 * for givezy-cto in the team log). This test fails if that filter is ever removed or loosened:
 * - a charity's admin, signed in with the second step, sees only their own charity's rows;
 * - the same admin without the second step, or in a session started with a password, sees nothing;
 * - a signed-in person who manages no charity sees nothing;
 * - a platform admin sees every charity's rows;
 * - a visitor who is not signed in is refused outright.
 * Builds its own rows in a transaction that is rolled back; needs only the migrations applied.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
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
  const { id } = await one("insert into auth.users (id, email, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated') returning id", [`vf${stamp()}@x.test`]);
  if (role !== "user") await run("update public.profiles set role = $2 where id = $1", [id, role]);
  return id as string;
}
async function charity(owner: string) {
  const { id } = await one(
    "insert into public.charities (slug, quickgive_code, name_en, legal_name_en, status) values ($1, $2, 'C', 'C NPC', 'approved') returning id",
    [`vf-${stamp()}`, `V${String(Date.now()).slice(-6)}${seq}`],
  );
  await run("insert into public.charity_admins (charity_id, user_id, role) values ($1, $2, 'owner')", [id, owner]);
  return id as string;
}
/** A paid gift with an issued s18A receipt for it: one row in each of the three views. */
async function giftWithReceipt(charityId: string, receiptNumber: number) {
  const { id: donorId } = await one(
    "insert into public.donors (email, donor_type, age_confirmed_18_at, popia_consent_at) values ($1, 'individual', now(), now()) returning id",
    [`vfd${stamp()}@x.test`],
  );
  const { id: donationId } = await one(
    `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, total_charged_cents,
       gateway, gateway_ref, wants_18a, status, paid_at, tax_year)
     values ($1, $2, 10000, 0, 0, 10000, 'test', gen_random_uuid()::text, true, 'paid', '2026-10-01T10:00:00Z', 2027) returning id`,
    [donorId, charityId],
  );
  const { id: receiptId } = await one(
    `insert into public.s18a_receipts (charity_id, receipt_number, donor_id, tax_year, amount_cents, details)
     values ($1, $2, $3, 2027, 10000, $4) returning id`,
    [charityId, receiptNumber, donorId, JSON.stringify({ receipt_reference: `VF-${receiptNumber}`, donor: { name: "Sample Donor" } })],
  );
  await run("insert into public.s18a_receipt_donations (receipt_id, donation_id) values ($1, $2)", [receiptId, donationId]);
}

type Session = { aal: "aal1" | "aal2"; password?: boolean };
async function as(userId: string, s: Session) {
  await run("set local role authenticated");
  const claims = { sub: userId, role: "authenticated", aal: s.aal, amr: [{ method: s.password ? "password" : "otp", timestamp: 1 }] };
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
}
const reset = () => run("reset role");

const VIEWS = ["charity_donations", "charity_receipts", "charity_receipt_donations"] as const;
/** The charities whose rows each view shows the current session, out of the two this test made. */
async function charitiesSeen(view: (typeof VIEWS)[number], ours: string[]) {
  const rows = (await run(`select distinct charity_id from public.${view} where charity_id = any($1::uuid[])`, [ours])).rows;
  return rows.map((r) => r.charity_id as string).sort();
}

describe("the charity views only show a charity its own rows", () => {
  for (const view of VIEWS) {
    it(`${view}: an admin with the second step sees their own charity only`, async () => {
      await tx(async () => {
        const a = await user(), b = await user();
        const ca = await charity(a), cb = await charity(b);
        await giftWithReceipt(ca, 900001);
        await giftWithReceipt(cb, 900002);
        await as(a, { aal: "aal2" });
        expect(await charitiesSeen(view, [ca, cb])).toEqual([ca]);
        await reset();
      });
    });

    it(`${view}: the same admin without the second step, or signed in with a password, sees nothing`, async () => {
      await tx(async () => {
        const a = await user();
        const ca = await charity(a);
        await giftWithReceipt(ca, 900003);
        await as(a, { aal: "aal1" });
        expect(await charitiesSeen(view, [ca])).toEqual([]);
        await reset();
        await as(a, { aal: "aal2", password: true });
        expect(await charitiesSeen(view, [ca])).toEqual([]);
        await reset();
      });
    });

    it(`${view}: someone who manages no charity sees nothing, a platform admin sees every charity`, async () => {
      await tx(async () => {
        const a = await user(), b = await user(), stranger = await user(), admin = await user("platform_admin");
        const ca = await charity(a), cb = await charity(b);
        await giftWithReceipt(ca, 900004);
        await giftWithReceipt(cb, 900005);
        await as(stranger, { aal: "aal2" });
        expect(await charitiesSeen(view, [ca, cb])).toEqual([]);
        await reset();
        await as(admin, { aal: "aal2" });
        expect(await charitiesSeen(view, [ca, cb])).toEqual([ca, cb].sort());
        await reset();
      });
    });

    it(`${view}: a visitor who is not signed in is refused`, async () => {
      await tx(async () => {
        await run("set local role anon");
        await expect(run(`select 1 from public.${view} limit 1`)).rejects.toThrow(/permission denied/);
      });
    });
  }
});
