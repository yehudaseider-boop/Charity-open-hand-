/**
 * The four charity lists that blank contact details (donors, monthly donations, stopped monthly donations, keeping
 * donors) check "may this person see contact details?" once per call since 19/11/2026 (migration 20261119000002),
 * not once per row. The rules are unchanged: a role with 'contact' sees email and phone; any other role sees no
 * phone and no email, except an erased donor's placeholder email. Fixtures are built in a transaction that is
 * rolled back.
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
  const { id } = await one("insert into auth.users (id, email, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated') returning id", [`l${stamp()}@x.test`]);
  return id as string;
}
/** A donor whose monthly donation was paid once this tax year and then cancelled. */
async function stoppedMonthly(c: string, email: string) {
  const { id: d } = await one(
    `insert into public.donors (email, donor_type, age_confirmed_18_at, popia_consent_at) values ($1, 'individual', now(), now()) returning id`,
    [email],
  );
  const { id: r } = await one(
    `insert into public.recurring_donations (donor_id, charity_id, amount_cents, contribution_cents, status, charge_day, next_charge_at,
       authorization_encrypted, card_last4, gateway_customer_ref, cancelled_at, ended_reason)
     values ($1, $2, 18000, 0, 'cancelled', 15, '2026-11-15T08:00:00Z', 'secret', '4242', 'CUS_x', '2026-10-20T10:00:00Z', 'cancelled by the donor') returning id`,
    [d, c],
  );
  const { id: g } = await one(
    `insert into public.donations (donor_id, charity_id, recurring_id, amount_cents, platform_fee_cents, processing_charge_cents, total_charged_cents,
       gateway, gateway_ref, status, paid_at, tax_year)
     values ($1, $2, $3, 18000, 0, 0, 18000, 'test', gen_random_uuid()::text, 'paid', '2026-09-15T08:00:00Z', 2027) returning id`,
    [d, c, r],
  );
  // A once-off gift last tax year too, so the donor is on the keeping-donors list (it lists donors who gave before).
  const { id: earlier } = await one(
    `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, total_charged_cents,
       gateway, gateway_ref, status, paid_at, tax_year)
     values ($1, $2, 25000, 0, 0, 25000, 'test', gen_random_uuid()::text, 'paid', '2025-09-15T08:00:00Z', 2026) returning id`,
    [d, c],
  );
  for (const gift of [g, earlier]) {
    await run(
      `insert into public.donation_checkout_details (donation_id, donor_type, email, first_name, last_name, phone) values ($1, 'individual', $2, 'Thandi', 'Mokoena', '0821234567')`,
      [gift, email],
    );
  }
}
const as = async (id: string) => {
  await run("set local role authenticated");
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated", aal: "aal2", amr: [{ method: "otp" }] })]);
};
const reset = () => run("reset role");

// The 2026/27 tax year and the one before it, Johannesburg time.
const LISTS: [string, string, unknown[]][] = [
  ["donors", "select email::text as email, phone from public.charity_donor_list($1)", []],
  ["monthly donations", "select email::text as email, phone from public.charity_monthly_list($1)", []],
  ["stopped monthly donations", "select email::text as email, phone from public.charity_lapsed_monthly($1, $2, $3)", ["2026-03-01T00:00:00+02:00", "2027-03-01T00:00:00+02:00"]],
  [
    "keeping donors",
    "select email::text as email, phone from public.charity_keeping_donors($1, $2, $3, $4, $5)",
    ["2025-03-01T00:00:00+02:00", "2026-03-01T00:00:00+02:00", "2027-03-01T00:00:00+02:00", "2026-11-10T10:00:00+02:00"],
  ],
];

describe("the charity lists blank contact details exactly as before", () => {
  it("show email and phone to the owner; to a viewer, no phone and only an erased donor's placeholder email", async () => {
    await tx(async () => {
      const { id: c } = await one(
        `insert into public.charities (slug, quickgive_code, name_en, legal_name_en, status) values ($1, $2, 'C', 'C NPC', 'approved') returning id`,
        [`l-${stamp()}`, `L${String(Date.now()).slice(-6)}${seq}`],
      );
      const owner = await user();
      const viewer = await user();
      await run("insert into public.charity_admins (charity_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'viewer')", [c, owner, viewer]);
      const thandi = `thandi-${stamp()}@x.test`;
      const gone = `gone-${stamp()}@erased.invalid`;
      await stoppedMonthly(c, thandi);
      await stoppedMonthly(c, gone);

      for (const [name, sql, extra] of LISTS) {
        const read = async () => (await run(sql, [c, ...extra])).rows.map((r) => [r.email, r.phone]).sort();

        await as(owner);
        const owners = await read();
        await reset();
        // The owner sees Thandi's email and phone: the list itself has her, so the viewer check below means something.
        expect([name, owners.some(([e, p]) => e === thandi && p === "0821234567")]).toEqual([name, true]);

        await as(viewer);
        const viewers = await read();
        await reset();
        expect([name, viewers]).toEqual([name, owners.map(([e]) => [typeof e === "string" && e.endsWith("@erased.invalid") ? e : null, null]).sort()]);
      }
    });
  });
});
