/**
 * What a charity admin can see on their dashboard, checked in the database.
 * Needs the local Supabase running and seeded (npm run db:reset).
 * Every test runs inside a transaction that is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
let ids: Record<string, string>;

beforeAll(async () => {
  await client.connect();
  const one = async (sql: string, args: unknown[]) => (await client.query(sql, args)).rows[0]?.id as string;
  ids = {
    admin: await one("select id from auth.users where email = $1", ["admin@openhand.test"]),
    mealsAdmin: await one("select id from auth.users where email = $1", ["meals.admin@openhand.test"]),
    shulAdmin: await one("select id from auth.users where email = $1", ["shul.admin@openhand.test"]),
    donorUser: await one("select id from auth.users where email = $1", ["donor@openhand.test"]),
    meals: await one("select id from public.charities where slug = $1", ["northcliff-meals-fund"]),
    donor: await one("select id from public.donors where email = $1", ["donor@openhand.test"]),
    company: await one("select id from public.donors where email = $1", ["accounts@testtrading.test"]),
  };
  if (Object.values(ids).some((v) => !v)) throw new Error("Seed data missing. Run npm run db:reset.");
});
afterAll(() => client.end());

async function tx(fn: () => Promise<void>) {
  await client.query("begin");
  try {
    await fn();
  } finally {
    await client.query("rollback");
  }
}

/** Run one statement; a failing one rolls back to a savepoint so the test can go on. */
async function rows(sql: string, args: unknown[] = []) {
  await client.query("savepoint stmt");
  try {
    const result = (await client.query(sql, args)).rows;
    await client.query("release savepoint stmt");
    return result;
  } catch (e) {
    await client.query("rollback to savepoint stmt");
    throw e;
  }
}

/** Act as a signed-in user. aal2 means they completed the authenticator-app step. */
async function actAs(userId: string, aal: "aal1" | "aal2" = "aal2") {
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated", aal }),
  ]);
}

type DonationOptions = {
  donorId?: string;
  amount?: number;
  status?: "paid" | "pending" | "failed" | "refunded" | "charged_back";
  paidAt?: string;
  taxYear?: number;
  wants18a?: boolean;
};

/** A donation with the donor's checkout details, written as the server would. */
async function donation(o: DonationOptions = {}) {
  const amount = o.amount ?? 10_000;
  const status = o.status ?? "paid";
  const paidAt = status === "pending" || status === "failed" ? null : (o.paidAt ?? new Date().toISOString());
  const [{ id }] = await rows(
    `insert into public.donations
       (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, total_charged_cents,
        status, gateway, gateway_ref, tax_year, paid_at, failed_at, refunded_at, charged_back_at,
        wants_18a, is_anonymous, message, giving_kind)
     values ($1, $2, $3::bigint, 300, 0, $3::bigint + 300, $4, 'test', gen_random_uuid()::text,
        $5, $6, $7, $8, $9, $10, true, 'For the Sukkot meals', 'maaser')
     returning id`,
    [
      o.donorId ?? ids.donor,
      ids.meals,
      amount,
      status,
      paidAt ? (o.taxYear ?? 2027) : null,
      paidAt,
      status === "failed" ? new Date().toISOString() : null,
      status === "refunded" ? new Date().toISOString() : null,
      status === "charged_back" ? new Date().toISOString() : null,
      o.wants18a ?? false,
    ],
  );
  await rows(
    `insert into public.donation_checkout_details
       (donation_id, donor_type, email, first_name, last_name, id_number_encrypted, id_number_last4)
     values ($1, 'individual', 'donor@openhand.test', 'Dina', 'Donor', 'ciphertext', '0087')`,
    [id],
  );
  return id as string;
}

describe("charity_donations view", () => {
  it("never carries the donor's private columns", async () => {
    await tx(async () => {
      const cols = (
        await rows(
          "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'charity_donations'",
        )
      ).map((r) => r.column_name as string);
      expect(cols).toContain("amount_cents");
      for (const hidden of ["giving_kind", "id_number_encrypted", "tax_reference_encrypted", "user_id", "date_of_birth", "gateway", "gateway_ref"]) {
        expect(cols).not.toContain(hidden);
      }
    });
  });

  it("shows the charity admin the donation, message, anonymous flag and last 4 digits only", async () => {
    await tx(async () => {
      const id = await donation();
      await actAs(ids.mealsAdmin);
      const [r] = await rows(
        "select message, is_anonymous, first_name, id_number_last4 from public.charity_donations where id = $1",
        [id],
      );
      expect(r).toEqual({ message: "For the Sukkot meals", is_anonymous: true, first_name: "Dina", id_number_last4: "0087" });
      await expect(rows("select giving_kind from public.charity_donations")).rejects.toThrow(/giving_kind/);
    });
  });

  it("keeps giving_kind out of the charity admin's reach through the base table", async () => {
    await tx(async () => {
      const id = await donation();
      await actAs(ids.mealsAdmin);
      expect(await rows("select giving_kind from public.donations where id = $1", [id])).toHaveLength(0);
      expect(await rows("select id_number_encrypted from public.donation_checkout_details where donation_id = $1", [id])).toHaveLength(0);
    });
  });

  it("still lets the donor read their own giving_kind", async () => {
    await tx(async () => {
      const id = await donation();
      await actAs(ids.donorUser, "aal1");
      expect(await rows("select giving_kind from public.donations where id = $1", [id])).toEqual([{ giving_kind: "maaser" }]);
    });
  });

  it("shows nothing until the admin completes the second login step", async () => {
    await tx(async () => {
      await donation();
      await rows(
        "insert into public.recurring_donations (donor_id, charity_id, amount_cents) values ($1, $2, 5000)",
        [ids.donor, ids.meals],
      );
      const [{ n }] = await rows("select public.next_receipt_number($1) as n", [ids.meals]);
      await rows(
        `insert into public.s18a_receipts (charity_id, receipt_number, donor_id, tax_year, amount_cents, details)
         values ($1, $2, $3, 2027, 10000, '{}')`,
        [ids.meals, n, ids.donor],
      );

      await actAs(ids.mealsAdmin, "aal1");
      expect(await rows("select id from public.charity_donations")).toHaveLength(0);
      expect(await rows("select id from public.recurring_donations")).toHaveLength(0);
      expect(await rows("select id from public.s18a_receipts")).toHaveLength(0);

      await actAs(ids.mealsAdmin, "aal2");
      expect(await rows("select id from public.charity_donations")).toHaveLength(1);
      expect(await rows("select id from public.recurring_donations")).toHaveLength(1);
      expect(await rows("select id from public.s18a_receipts")).toHaveLength(1);
    });
  });

  it("gives another charity's admin nothing, by any route", async () => {
    await tx(async () => {
      const id = await donation({ donorId: ids.company });
      await rows(
        "insert into public.recurring_donations (donor_id, charity_id, amount_cents) values ($1, $2, 5000)",
        [ids.donor, ids.meals],
      );
      await actAs(ids.shulAdmin);
      expect(await rows("select id from public.charity_donations")).toHaveLength(0);
      expect(await rows("select id from public.charity_donations where id = $1", [id])).toHaveLength(0);
      expect(await rows("select id from public.donations")).toHaveLength(0);
      expect(await rows("select id from public.donors")).toHaveLength(0);
      expect(await rows("select donation_id from public.donation_checkout_details")).toHaveLength(0);
      expect(await rows("select id from public.recurring_donations")).toHaveLength(0);
      expect(await rows("select id from public.s18a_receipts")).toHaveLength(0);
      const [summary] = await rows("select * from public.charity_giving_summary($1, 2027, now() - interval '1 year')", [ids.meals]);
      expect(Number(summary.tax_year_paid_cents)).toBe(0);
      expect(Number(summary.tax_year_donors)).toBe(0);
      expect(await rows("select * from public.charity_giving_by_month($1, now() - interval '1 year', 'Africa/Johannesburg')", [ids.meals])).toHaveLength(0);
      expect(await rows("select * from public.charity_monthly_donations_summary($1)", [ids.meals])).toHaveLength(0);
    });
  });

  it("is closed to visitors who are not signed in", async () => {
    await tx(async () => {
      await client.query("set local role anon");
      await expect(rows("select id from public.charity_donations")).rejects.toThrow(/permission denied/);
      await expect(rows("select * from public.charity_giving_summary($1, 2027, now())", [ids.meals])).rejects.toThrow(/permission denied/);
    });
  });

  it("lets a platform admin see any charity's donations", async () => {
    await tx(async () => {
      await donation();
      await actAs(ids.admin, "aal1");
      expect(await rows("select id from public.charity_donations where charity_id = $1", [ids.meals])).toHaveLength(1);
    });
  });
});

describe("overview figures", () => {
  it("count paid donations, donors, 18A requests, reversals, pending and failed separately", async () => {
    await tx(async () => {
      const monthStart = "2026-10-01T00:00:00+02:00";
      await donation({ amount: 10_000, paidAt: "2026-10-05T10:00:00+02:00", wants18a: true });
      await donation({ amount: 25_050, paidAt: "2026-10-06T10:00:00+02:00" });
      await donation({ amount: 50_000, paidAt: "2026-07-01T10:00:00+02:00", donorId: ids.company });
      await donation({ amount: 7_000, paidAt: "2026-02-20T10:00:00+02:00", taxYear: 2026 });
      await donation({ amount: 9_900, paidAt: "2026-09-01T10:00:00+02:00", status: "refunded" });
      await donation({ status: "pending" });
      await donation({ status: "failed" });
      await actAs(ids.mealsAdmin);

      const [s] = await rows("select * from public.charity_giving_summary($1, 2027, $2)", [ids.meals, monthStart]);
      expect(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Number(v)]))).toEqual({
        tax_year_paid_count: 3,
        tax_year_paid_cents: 85_050,
        tax_year_donors: 2,
        tax_year_18a_count: 1,
        tax_year_reversed_count: 1,
        tax_year_reversed_cents: 9_900,
        month_paid_count: 2,
        month_paid_cents: 35_050,
        pending_count: 1,
        failed_this_month_count: 1,
      });

      const months = await rows(
        "select month::text, paid_count, paid_cents, reversed_cents from public.charity_giving_by_month($1, $2, 'Africa/Johannesburg')",
        [ids.meals, "2026-03-01T00:00:00+02:00"],
      );
      expect(months.map((m) => [m.month, Number(m.paid_count), Number(m.paid_cents), Number(m.reversed_cents)])).toEqual([
        ["2026-07-01", 1, 50_000, 0],
        ["2026-09-01", 0, 0, 9_900],
        ["2026-10-01", 2, 35_050, 0],
      ]);
    });
  });

  it("put a donation paid just after midnight on the 1st in Johannesburg in the new month", async () => {
    await tx(async () => {
      // 00:30 on 01/10/2026 in Johannesburg is still 30/09/2026 in UTC.
      await donation({ amount: 4_000, paidAt: "2026-10-01T00:30:00+02:00" });
      await actAs(ids.mealsAdmin);
      const months = await rows(
        "select month::text from public.charity_giving_by_month($1, '2026-09-01T00:00:00+02:00', 'Africa/Johannesburg')",
        [ids.meals],
      );
      expect(months).toEqual([{ month: "2026-10-01" }]);
    });
  });

  it("group monthly donations by status", async () => {
    await tx(async () => {
      await rows(
        `insert into public.recurring_donations (donor_id, charity_id, amount_cents, status) values
           ($1, $2, 5000, 'active'), ($1, $2, 7500, 'active'), ($1, $2, 3000, 'cancelled')`,
        [ids.donor, ids.meals],
      );
      await actAs(ids.mealsAdmin);
      const r = await rows("select status, donations, amount_cents from public.charity_monthly_donations_summary($1) order by status", [ids.meals]);
      expect(r.map((x) => [x.status, Number(x.donations), Number(x.amount_cents)])).toEqual([
        ["active", 2, 12_500],
        ["cancelled", 1, 3_000],
      ]);
    });
  });
});
