/**
 * What a charity admin can see about donations: the charity views and
 * functions, and what is closed to them. Builds its own fixtures in a
 * transaction that is rolled back; needs only the migrations applied.
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
    [`c-${stamp()}`, `C${String(Date.now()).slice(-6)}${seq}`],
  );
  if (adminUser) await run("insert into public.charity_admins (charity_id, user_id, role) values ($1, $2, 'owner')", [id, adminUser]);
  return id as string;
}
async function donor(userId?: string) {
  const { id } = await one(
    `insert into public.donors (email, donor_type, user_id, age_confirmed_18_at, popia_consent_at) values ($1, 'individual', $2, now(), now()) returning id`,
    [`d${stamp()}@x.test`, userId ?? null],
  );
  return id as string;
}
async function donation(c: string, d: string, o: { amount?: number; status?: string; paidAt?: string; first?: string; last?: string; email?: string; wants18a?: boolean } = {}) {
  const amount = o.amount ?? 10_000;
  const status = o.status ?? "paid";
  const paid = status === "paid" || status === "refunded";
  const { id } = await one(
    `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, total_charged_cents,
       gateway, gateway_ref, wants_18a, status, paid_at, tax_year)
     values ($1, $2, $3, 400, 100, $4, 'test', gen_random_uuid()::text, $5, $6, $7, $8) returning id`,
    [d, c, amount, amount + 500, o.wants18a ?? false, status, paid ? (o.paidAt ?? "2026-10-01T10:00:00Z") : null, paid ? 2027 : null],
  );
  await run(
    `insert into public.donation_checkout_details (donation_id, donor_type, email, first_name, last_name, id_number_last4)
     values ($1, 'individual', $2, $3, $4, '9085')`,
    [id, o.email ?? "donor@x.test", o.first ?? "Sarah", o.last ?? "Levin"],
  );
  return id as string;
}
const asUser = async (id: string, role = "authenticated") => {
  await run(`set local role ${role}`);
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role })]);
};
const reset = () => run("reset role");

describe("the charity view", () => {
  it("shows a charity admin their own donations, with donor details, and nothing about fees or the giving kind", async () => {
    await tx(async () => {
      const a = await user(), b = await user();
      const ca = await charity(a), cb = await charity(b);
      const d = await donor();
      const mine = await donation(ca, d, { first: "Sarah", last: "Levin", email: "sarah@x.test" });
      await donation(cb, d);
      await run("insert into public.donation_giving_kinds (donation_id, kind) values ($1, 'chomesh')", [mine]);

      await asUser(a);
      const rows = (await run("select * from public.charity_donations")).rows;
      expect(rows.map((r) => r.id)).toEqual([mine]);
      expect(rows[0]).toMatchObject({ first_name: "Sarah", last_name: "Levin", email: "sarah@x.test", amount_cents: "10000", id_number_last4: "9085" });
      const columns = Object.keys(rows[0]);
      for (const hidden of ["platform_fee_cents", "fee_vat_cents", "processing_charge_cents", "total_charged_cents", "gateway", "gateway_ref", "giving_kind", "kind", "id_number_encrypted", "tax_reference_encrypted"]) {
        expect(columns).not.toContain(hidden);
      }
    });
  });

  it("shows a platform admin every charity's donations", async () => {
    await tx(async () => {
      const admin = await user("platform_admin");
      const d = await donor();
      await donation(await charity(), d);
      await donation(await charity(), d);
      await asUser(admin);
      expect((await run("select id from public.charity_donations")).rowCount).toBe(2);
    });
  });

  it("shows nothing to a signed-in stranger or a visitor", async () => {
    await tx(async () => {
      const a = await user(), stranger = await user();
      await donation(await charity(a), await donor());
      await asUser(stranger);
      expect((await run("select id from public.charity_donations")).rowCount).toBe(0);
      await reset();
      await run("set local role anon");
      await expect(run("select id from public.charity_donations")).rejects.toThrow(/permission denied/);
    });
  });

  it("a charity admin cannot read the raw donation, donor or checkout tables", async () => {
    await tx(async () => {
      const a = await user();
      const c = await charity(a);
      const d = await donor();
      await donation(c, d);
      await asUser(a);
      for (const table of ["donations", "donors", "donation_checkout_details", "donation_giving_kinds"]) {
        expect((await run(`select * from public.${table}`)).rowCount).toBe(0);
      }
    });
  });

  it("cannot be changed through the view", async () => {
    await tx(async () => {
      const a = await user();
      const c = await charity(a);
      const id = await donation(c, await donor());
      await asUser(a);
      await run("savepoint s");
      await expect(run("update public.charity_donations set amount_cents = 1 where id = $1", [id])).rejects.toThrow(/permission denied|cannot update view/);
      await run("rollback to savepoint s");
      await expect(run("delete from public.charity_donations where id = $1", [id])).rejects.toThrow(/permission denied|cannot delete from view/);
    });
  });
});

describe("a donor's own view is unchanged", () => {
  it("a donor still reads their own donations and their private giving kind, and a charity admin does not", async () => {
    await tx(async () => {
      const donorUser = await user(), adminUser = await user();
      const c = await charity(adminUser);
      const d = await donor(donorUser);
      const id = await donation(c, d);
      await run("insert into public.donation_giving_kinds (donation_id, kind) values ($1, 'maaser')", [id]);

      await asUser(donorUser);
      expect((await run("select id from public.donations")).rowCount).toBe(1);
      expect((await run("select kind from public.donation_giving_kinds")).rows).toEqual([{ kind: "maaser" }]);
      await reset();
      await asUser(adminUser);
      expect((await run("select kind from public.donation_giving_kinds")).rowCount).toBe(0);
    });
  });

  it("the giving kind can only be maaser, chomesh or tzedaka, and only the server writes it", async () => {
    await tx(async () => {
      const id = await donation(await charity(), await donor());
      await run("savepoint s");
      await expect(run("insert into public.donation_giving_kinds (donation_id, kind) values ($1, 'other')", [id])).rejects.toThrow(/check constraint/);
      await run("rollback to savepoint s");
      const u = await user();
      await asUser(u);
      await expect(run("insert into public.donation_giving_kinds (donation_id, kind) values ($1, 'maaser')", [id])).rejects.toThrow(/permission denied/);
    });
  });
});

describe("charity_overview, charity_monthly_totals and charity_donor_list", () => {
  it("add up the right things for the right charity", async () => {
    await tx(async () => {
      const a = await user();
      const c = await charity(a);
      const d1 = await donor(), d2 = await donor();
      await donation(c, d1, { amount: 10_000, paidAt: "2026-09-15T10:00:00Z", wants18a: true });
      await donation(c, d1, { amount: 5_000, paidAt: "2026-10-05T10:00:00Z", first: "Sarah", last: "Levin", email: "sarah@x.test" });
      await donation(c, d2, { amount: 20_000, paidAt: "2026-10-20T10:00:00Z", first: "David", last: "Cohen", email: "david@x.test" });
      await donation(c, d2, { amount: 7_000, status: "refunded", paidAt: "2026-10-21T10:00:00Z" });
      await donation(c, d2, { amount: 1_000, status: "pending" });
      await donation(c, d2, { amount: 1_000, status: "failed" });
      await donation(await charity(), d1, { amount: 999_999 }); // another charity: never counted

      await asUser(a);
      const o = (await run("select * from public.charity_overview($1, '2026-03-01', '2027-03-01')", [c])).rows[0];
      expect(o).toMatchObject({
        paid_count: "3", paid_cents: "35000", donor_count: "2", receipt_requested_cents: "10000",
        refunded_count: "1", refunded_cents: "7000", pending_count: "1", failed_count: "1",
      });

      const months = (await run("select to_char(month, 'YYYY-MM') as m, donation_count, amount_cents from public.charity_monthly_totals($1)", [c])).rows;
      expect(months).toEqual([
        { m: "2026-10", donation_count: "2", amount_cents: "25000" },
        { m: "2026-09", donation_count: "1", amount_cents: "10000" },
      ]);

      const donors = (await run("select display_name, email, donation_count, total_cents from public.charity_donor_list($1)", [c])).rows;
      expect(donors).toEqual([
        { display_name: "David Cohen", email: "david@x.test", donation_count: "1", total_cents: "20000" },
        { display_name: "Sarah Levin", email: "sarah@x.test", donation_count: "2", total_cents: "15000" },
      ]);
    });
  });

  it("put a late-night donation in the right Johannesburg month", async () => {
    await tx(async () => {
      const a = await user();
      const c = await charity(a);
      // 23:30 UTC on 31 October is 01:30 on 1 November in Johannesburg.
      await donation(c, await donor(), { paidAt: "2026-10-31T23:30:00Z" });
      await asUser(a);
      const months = (await run("select to_char(month, 'YYYY-MM') as m from public.charity_monthly_totals($1)", [c])).rows;
      expect(months).toEqual([{ m: "2026-11" }]);
    });
  });

  it("refuse anyone who does not manage the charity", async () => {
    await tx(async () => {
      const a = await user(), stranger = await user();
      const c = await charity(a);
      await asUser(stranger);
      for (const sql of [
        "select * from public.charity_overview($1, '2026-03-01', '2027-03-01')",
        "select * from public.charity_monthly_totals($1)",
        "select * from public.charity_donor_list($1)",
      ]) {
        await run("savepoint s");
        await expect(run(sql, [c])).rejects.toThrow(/Not allowed/);
        await run("rollback to savepoint s");
      }
      await reset();
      await run("set local role anon");
      await expect(run("select * from public.charity_donor_list($1)", [c])).rejects.toThrow(/permission denied/);
    });
  });

  it("let a platform admin look at any charity", async () => {
    await tx(async () => {
      const admin = await user("platform_admin");
      const c = await charity();
      await donation(c, await donor());
      await asUser(admin);
      expect((await run("select paid_count from public.charity_overview($1, '2026-03-01', '2027-03-01')", [c])).rows[0].paid_count).toBe("1");
    });
  });
});
