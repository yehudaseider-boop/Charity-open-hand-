/**
 * Keeping donors, as the database answers a charity (charity_keeping_donors): what each donor gave this tax year,
 * last tax year and earlier, from paid gifts only; nothing about an erased donor; closed to everyone else.
 * Builds its own fixtures in a transaction that is rolled back; needs only the migrations applied.
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
  const { id } = await one("insert into auth.users (id, email, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated') returning id", [`u${stamp()}@x.test`]);
  if (role !== "user") await run("update public.profiles set role = $2 where id = $1", [id, role]);
  return id as string;
}
async function charity(adminUser?: string) {
  const { id } = await one(
    `insert into public.charities (slug, quickgive_code, name_en, legal_name_en, status) values ($1, $2, 'C', 'C NPC', 'approved') returning id`,
    [`c-${stamp()}`, `K${String(Date.now()).slice(-6)}${seq}`],
  );
  if (adminUser) await run("insert into public.charity_admins (charity_id, user_id, role) values ($1, $2, 'owner')", [id, adminUser]);
  return id as string;
}
async function donor() {
  const { id } = await one(
    `insert into public.donors (email, donor_type, age_confirmed_18_at, popia_consent_at) values ($1, 'individual', now(), now()) returning id`,
    [`d${stamp()}@x.test`],
  );
  return id as string;
}
/** One gift to the charity, with the details typed at checkout. */
async function gift(c: string, d: string, amount: number, paidAt: string, o: { status?: string; recorded?: boolean; first?: string; email?: string } = {}) {
  const recorded = o.recorded === true;
  const { id } = await one(
    recorded
      ? `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, total_charged_cents, gateway, status, paid_at, tax_year, recorded_method, came_from)
         values ($1, $2, $3, 0, 0, $3, 'recorded', $4, $5, 2027, 'eft', 'recorded') returning id`
      : `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, total_charged_cents, gateway, gateway_ref, status, paid_at, tax_year)
         values ($1, $2, $3, 400, 100, $3 + 500, 'test', gen_random_uuid()::text, $4, $5, 2027) returning id`,
    [d, c, amount, o.status ?? "paid", paidAt],
  );
  await run(
    `insert into public.donation_checkout_details (donation_id, donor_type, email, first_name, last_name, phone)
     values ($1, 'individual', $2, $3, 'Mokoena', '0821234567')`,
    [id, o.email ?? "thandi@x.test", o.first ?? "Thandi"],
  );
  return id as string;
}
const asUser = async (id: string, claims: Record<string, unknown> = {}) => {
  await run("set local role authenticated");
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated", aal: "aal2", amr: [{ method: "otp" }], ...claims })]);
};
const reset = () => run("reset role");

// The 2026/27 tax year (1 March 2026 to 28 February 2027) and the one before it, Johannesburg time.
const LAST_FROM = "2025-03-01T00:00:00+02:00";
const THIS_FROM = "2026-03-01T00:00:00+02:00";
const THIS_TO = "2027-03-01T00:00:00+02:00";
const list = (c: string, a = LAST_FROM, b = THIS_FROM, e = THIS_TO) => run("select * from public.charity_keeping_donors($1, $2, $3, $4)", [c, a, b, e]).then((r) => r.rows);

describe("keeping donors", () => {
  it("splits each donor's paid gifts into this tax year, last tax year and earlier", async () => {
    await tx(async () => {
      const a = await user();
      const c = await charity(a);
      const again = await donor(), lapsed = await donor(), older = await donor(), newOnly = await donor();
      await gift(c, again, 10_000, "2025-06-01T10:00:00Z");
      await gift(c, again, 25_000, "2026-08-01T10:00:00Z");
      await gift(c, lapsed, 30_000, "2025-12-01T10:00:00Z");
      await gift(c, older, 5_000, "2024-05-01T10:00:00Z");
      // New this year only: not needed by any list, so not returned.
      await gift(c, newOnly, 7_000, "2026-09-01T10:00:00Z");

      await asUser(a);
      const rows = await list(c);
      expect(rows).toHaveLength(3);
      const by = (id: string) => rows.find((r) => r.donor_id === id);
      expect(by(again)).toMatchObject({ this_cents: "25000", last_cents: "10000", earlier_cents: "0", erased: false, recorded_only: false, display_name: "Thandi Mokoena", email: "thandi@x.test", phone: "0821234567" });
      expect(by(lapsed)).toMatchObject({ this_cents: "0", last_cents: "30000", earlier_cents: "0" });
      expect(by(older)).toMatchObject({ this_cents: "0", last_cents: "0", earlier_cents: "5000" });
      expect(by(newOnly)).toBeUndefined();
      // No ID, tax or payment details come back.
      for (const hidden of ["id_number", "tax_number", "gateway_ref", "contribution_cents", "platform_fee_cents"]) expect(Object.keys(rows[0])).not.toContain(hidden);
    });
  });

  it("puts a gift at midnight on 1 March in the new tax year, and one a second before in the old one", async () => {
    await tx(async () => {
      const a = await user();
      const c = await charity(a);
      const d1 = await donor(), d2 = await donor();
      await gift(c, d1, 1_000, "2026-02-28T21:59:59Z"); // 23:59:59 on 28 February in Johannesburg
      await gift(c, d2, 2_000, "2026-02-28T22:00:00Z"); // midnight, 1 March
      await gift(c, d2, 3_000, "2025-04-01T10:00:00Z");
      await gift(c, d1, 9_999, "2027-02-28T22:00:00Z"); // the next tax year: ignored
      await asUser(a);
      const rows = await list(c);
      expect(rows.find((r) => r.donor_id === d1)).toMatchObject({ this_cents: "0", last_cents: "1000" });
      expect(rows.find((r) => r.donor_id === d2)).toMatchObject({ this_cents: "2000", last_cents: "3000" });
    });
  });

  it("counts only paid gifts: refunds and charge-backs don't; gifts the charity recorded do", async () => {
    await tx(async () => {
      const a = await user();
      const c = await charity(a);
      const refunded = await donor(), recorded = await donor();
      await gift(c, refunded, 50_000, "2025-06-01T10:00:00Z", { status: "refunded" });
      await gift(c, refunded, 40_000, "2025-07-01T10:00:00Z", { status: "charged_back" });
      await gift(c, recorded, 12_000, "2025-06-01T10:00:00Z", { recorded: true });
      await asUser(a);
      const rows = await list(c);
      expect(rows.map((r) => r.donor_id)).toEqual([recorded]);
      expect(rows[0]).toMatchObject({ last_cents: "12000", recorded_only: true });
    });
  });

  it("counts an erased donor's gifts but shows nothing about them", async () => {
    await tx(async () => {
      const a = await user();
      const c = await charity(a);
      const d = await donor();
      await gift(c, d, 8_000, "2025-06-01T10:00:00Z");
      await run("select public.erase_donor_data(array[$1]::uuid[])", [d]);
      await asUser(a);
      const rows = await list(c);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ erased: true, donor_id: null, display_name: null, email: null, phone: null, donor_type: null, last_paid_at: null, last_cents: "8000" });
    });
  });

  it("needs a proper period", async () => {
    await tx(async () => {
      const a = await user();
      const c = await charity(a);
      await asUser(a);
      for (const args of [[c, null, THIS_FROM, THIS_TO], [c, THIS_FROM, LAST_FROM, THIS_TO], [c, LAST_FROM, THIS_TO, THIS_FROM]]) {
        await run("savepoint s");
        await expect(run("select * from public.charity_keeping_donors($1, $2, $3, $4)", args)).rejects.toThrow(/period/);
        await run("rollback to savepoint s");
      }
    });
  });

  it("refuses another charity's admin, a stranger, a session without the second step, one started with a password, and visitors", async () => {
    await tx(async () => {
      const a = await user(), b = await user(), stranger = await user(), admin = await user("platform_admin");
      const ca = await charity(a), cb = await charity(b);
      const mine = await donor();
      await gift(ca, mine, 1_000, "2025-06-01T10:00:00Z");
      await gift(cb, await donor(), 1_000, "2025-06-01T10:00:00Z");

      const refused = async (c: string, pattern: RegExp) => {
        await run("savepoint s");
        await expect(list(c)).rejects.toThrow(pattern);
        await run("rollback to savepoint s");
      };

      await asUser(a);
      expect((await list(ca)).map((r) => r.donor_id)).toEqual([mine]);
      await refused(cb, /Not allowed/);

      await reset();
      await asUser(stranger);
      await refused(ca, /Not allowed/);

      await reset();
      await asUser(a, { aal: "aal1" });
      await refused(ca, /Not allowed/);

      await reset();
      await asUser(a, { amr: [{ method: "password" }] });
      await refused(ca, /Not allowed/);

      await reset();
      await asUser(admin);
      expect((await list(ca)).map((r) => r.donor_id)).toEqual([mine]);

      await reset();
      await run("set local role anon");
      await refused(ca, /permission denied/);
    });
  });
});
