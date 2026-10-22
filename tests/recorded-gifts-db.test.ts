/** Recorded gifts in the database: their shape, when they can be removed, and what the charity sees. Needs the local Supabase, seeded. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
let charity: string, admin: string;
beforeAll(async () => {
  await client.connect();
  charity = (await run("select id from public.charities where slug = $1", ["northcliff-meals-fund"])).rows[0].id;
  admin = (await run("select id from auth.users where email = $1", ["meals.admin@nedivlev.test"])).rows[0].id;
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
async function refused(sql: string, args: unknown[], pattern: RegExp) {
  await run("savepoint s");
  await expect(run(sql, args)).rejects.toThrow(pattern);
  await run("rollback to savepoint s");
}
const donor = async () => (await run("insert into public.donors (email, donor_type) values ($1, 'individual') returning id", [`rec-${Math.random()}@x.test`])).rows[0].id as string;
const recorded = (d: string, o: { amount?: number; fee?: number; method?: string | null; gateway?: string; came?: string | null; ref?: string | null; wants?: boolean } = {}) =>
  run(
    `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, total_charged_cents, gateway, status, paid_at, tax_year, recorded_method, came_from, external_ref, wants_18a)
     values ($1, $2, $3, 0, $4, $5, $6, 'paid', '2026-03-05T12:00:00+02:00', 2027, $7, $8, $9, $10) returning id`,
    [d, charity, o.amount ?? 50_000, o.fee ?? 0, (o.amount ?? 50_000) + (o.fee ?? 0), o.gateway ?? "recorded", o.method === undefined ? "eft" : o.method, o.came === undefined ? "recorded" : o.came, o.ref ?? null, o.wants ?? false],
  );

describe("recorded gifts", () => {
  it("have no fee, no provider, and say how they came in", async () => {
    await tx(async () => {
      const d = await donor();
      await expect(recorded(d)).resolves.toBeTruthy();
      await run("savepoint s");
      await expect(recorded(d, { fee: 100 })).rejects.toThrow(/recorded_gift_shape/);
      await run("rollback to savepoint s");
      await expect(recorded(d, { method: null })).rejects.toThrow(/recorded_gift_shape/);
      await run("rollback to savepoint s");
      await expect(recorded(d, { came: "website" })).rejects.toThrow(/recorded_gift_shape/);
      await run("rollback to savepoint s");
      // A gift through the payment provider can't claim to be recorded by the charity.
      await expect(recorded(d, { gateway: "test", method: null, came: "recorded" })).rejects.toThrow(/recorded_gift_shape/);
      await run("rollback to savepoint s");
      await expect(recorded(d, { method: "bitcoin" })).rejects.toThrow(/donation_recorded_method/);
    });
  });

  it("one reference once per charity", async () => {
    await tx(async () => {
      const d = await donor();
      await recorded(d, { ref: "BANK-1" });
      await run("savepoint s");
      await expect(recorded(d, { ref: "BANK-1" })).rejects.toThrow(/donations_recorded_ref/);
    });
  });

  it("can be removed until it is on a receipt; a paid online gift never can", async () => {
    await tx(async () => {
      const d = await donor();
      const a = (await recorded(d)).rows[0].id;
      await expect(run("delete from public.donations where id = $1", [a])).resolves.toMatchObject({ rowCount: 1 });
      const b = (await recorded(d, { wants: true })).rows[0].id;
      await run("update public.charities set is_s18a = true, mandate_signed_at = '2025-01-01' where id = $1", [charity]);
      
      await run("select * from public.issue_s18a_receipt($1, $2, 2027, $3::uuid[], 'MEALS', '{}'::jsonb)", [charity, d, [b]]);
      await refused("delete from public.donations where id = $1", [b], /cannot be deleted/);
      const online = (await recorded(d, { gateway: "test", method: null, came: "website" })).rows[0].id;
      await refused("delete from public.donations where id = $1", [online], /cannot be deleted/);
    });
  });

  it("how a gift came in can't be changed afterwards", async () => {
    await tx(async () => {
      const d = await donor();
      const a = (await recorded(d)).rows[0].id;
      await refused("update public.donations set recorded_method = 'cash' where id = $1", [a], /cannot change/);
      await refused("update public.donations set gateway = 'test', recorded_method = null where id = $1", [a], /cannot change|recorded_gift_shape/);
    });
  });

  it("the charity sees how each gift came in; a browser can't read or write imports", async () => {
    await tx(async () => {
      const d = await donor();
      await recorded(d, { ref: "BANK-9" });
      await run("insert into public.donation_checkout_details (donation_id, donor_type, email) select id, 'individual', 'v@x.test' from public.donations where external_ref = 'BANK-9'");
      await run("set local role authenticated");
      await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: admin, role: "authenticated", aal: "aal2" })]);
      const seen = await run("select recorded_method, external_ref, came_from from public.charity_donations where external_ref = 'BANK-9'");
      expect(seen.rows).toEqual([{ recorded_method: "eft", external_ref: "BANK-9", came_from: "recorded" }]);
      await refused("select * from public.gift_imports", [], /permission denied/);
      await refused("insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, total_charged_cents, gateway) values ($1, $2, 1, 0, 0, 1, 'recorded')", [d, charity], /permission denied|row-level security/);
    });
  });

  it("record_gifts saves a whole file in one go: one bad row means nothing at all is saved", async () => {
    await tx(async () => {
      const gift = (email: string, ref: string | null) => ({ donor_type: "individual", email, first_name: "A", last_name: "B", amount_cents: 1000, paid_at: "2026-03-05T12:00:00+02:00", tax_year: 2027, method: "eft", wants_18a: false, campaign_id: null, reference: ref });
      const imp = { file_name: "gifts.csv", file_fingerprint: "a".repeat(32), confirmed_at: new Date().toISOString() };
      const before = Number((await run("select count(*) from public.donations")).rows[0].count);
      await run("savepoint s");
      // Two rows with the same reference: the second is refused, and the first is not kept either.
      await expect(run("select public.record_gifts($1, $2, $3, $4)", [charity, admin, imp, JSON.stringify([gift("one@x.test", "R-1"), gift("two@x.test", "R-1")])])).rejects.toThrow(/donations_recorded_ref/);
      await run("rollback to savepoint s");
      expect(Number((await run("select count(*) from public.donations")).rows[0].count)).toBe(before);
      expect(Number((await run("select count(*) from public.gift_imports where file_name = 'gifts.csv'")).rows[0].count)).toBe(0);
      // A good file is saved, with its donors, gifts and details, and the same file again is refused.
      const ok = (await run("select public.record_gifts($1, $2, $3, $4) as r", [charity, admin, imp, JSON.stringify([gift("one@x.test", "R-1"), gift("two@x.test", "R-2")])])).rows[0].r;
      expect(ok.donation_ids).toHaveLength(2);
      expect(Number((await run("select count(*) from public.donation_checkout_details where donation_id = any($1::uuid[])", [ok.donation_ids])).rows[0].count)).toBe(2);
      await run("savepoint s2");
      await expect(run("select public.record_gifts($1, $2, $3, $4)", [charity, admin, imp, JSON.stringify([gift("three@x.test", "R-3")])])).rejects.toThrow(/gift_imports_once/);
      await run("rollback to savepoint s2");
      // An import can't be removed while it still has gifts.
      await expect(run("delete from public.gift_imports where id = $1", [ok.import_id])).rejects.toThrow(/donations_import_id_fkey/);
    });
  });

  it("a recorded gift to a campaign counts in the campaign's public total (Yehuda, 21/10/2026)", async () => {
    await tx(async () => {
      const camp = (await run("insert into public.campaigns (charity_id, slug, title, target_cents, status) values ($1, 'rec-camp', 'Roof', 1000000, 'active') returning id", [charity])).rows[0].id;
      const gift = { donor_type: "individual", email: "eft@x.test", first_name: "A", last_name: "B", amount_cents: 125_050, paid_at: "2026-03-05T12:00:00+02:00", tax_year: 2027, method: "eft", wants_18a: false, campaign_id: camp, reference: "EFT-ROOF" };
      await run("select public.record_gifts($1, $2, null, $3)", [charity, admin, JSON.stringify([gift])]);
      await run("set local role anon");
      const p = (await run("select raised_cents, gift_count from public.campaign_progress($1::uuid[])", [[camp]])).rows[0];
      expect([Number(p.raised_cents), Number(p.gift_count)]).toEqual([125_050, 1]);
    });
  });

  it("finds a donor who gave online with capitals in their email (review 22/10/2026)", async () => {
    await tx(async () => {
      const online = (await run("insert into public.donors (email, donor_type) values ('Sarah.Case@Gmail.test', 'individual') returning id")).rows[0].id;
      const gift = { donor_type: "individual", email: "sarah.case@gmail.test", first_name: "Sarah", last_name: "Case", amount_cents: 50_000, paid_at: "2026-03-05T12:00:00+02:00", tax_year: 2027, method: "eft", wants_18a: false, campaign_id: null, reference: "EFT-CASE" };
      const r = (await run("select public.record_gifts($1, $2, null, $3) as r", [charity, admin, JSON.stringify([gift])])).rows[0].r;
      expect((await run("select donor_id from public.donations where id = $1", [r.donation_ids[0]])).rows[0].donor_id).toBe(online);
    });
  });

  it("only the server may call record_gifts", async () => {
    await tx(async () => {
      await run("set local role authenticated");
      await expect(run("select public.record_gifts($1, $2, null, '[]'::jsonb)", [charity, admin])).rejects.toThrow(/permission denied/);
    });
  });
});
