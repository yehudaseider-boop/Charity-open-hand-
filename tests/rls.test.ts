/**
 * Database rules: row-level security, immutable receipts, money constraints.
 * Needs the local Supabase running and seeded (npm run db:reset).
 * Every test runs inside a transaction that is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const DB_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const client = new pg.Client({ connectionString: DB_URL });

let ids: Record<string, string>;

beforeAll(async () => {
  await client.connect();
  const q = async (sql: string, args: unknown[]) => (await client.query(sql, args)).rows[0]?.id as string;
  ids = {
    admin: await q("select id from auth.users where email = $1", ["admin@nedivlev.test"]),
    mealsAdmin: await q("select id from auth.users where email = $1", ["meals.admin@nedivlev.test"]),
    shulAdmin: await q("select id from auth.users where email = $1", ["shul.admin@nedivlev.test"]),
    donorUser: await q("select id from auth.users where email = $1", ["donor@nedivlev.test"]),
    meals: await q("select id from public.charities where slug = $1", ["northcliff-meals-fund"]),
    shul: await q("select id from public.charities where slug = $1", ["glenhazel-shul-fund"]),
    donor: await q("select id from public.donors where email = $1", ["donor@nedivlev.test"]),
    company: await q("select id from public.donors where email = $1", ["accounts@testtrading.test"]),
  };
  if (Object.values(ids).some((v) => !v)) throw new Error("Seed data missing. Run npm run db:reset.");
});

afterAll(async () => {
  await client.end();
});

/** Run fn in a rolled-back transaction, as an anonymous visitor or a signed-in user. */
async function as<T>(who: "anon" | string | null, fn: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    if (who === "anon") {
      await client.query("set local role anon");
      await client.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    } else if (who) {
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: who, role: "authenticated", aal: "aal2" }),
      ]);
    }
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

/**
 * Run one statement. Inside a transaction it gets its own savepoint, so a
 * statement that is expected to fail does not abort the rest of the test.
 */
async function rows(sql: string, args: unknown[] = []) {
  const inTx = (await client.query("select now() <> statement_timestamp() as in_tx")).rows[0].in_tx;
  if (!inTx) return (await client.query(sql, args)).rows;
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

/** Insert a paid donation as the database owner (as the server would). */
async function insertDonation(donorId: string, charityId: string, amount = 10_000) {
  const { rows: r } = await client.query(
    `insert into public.donations
       (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, total_charged_cents,
        status, gateway, gateway_ref, tax_year, paid_at)
     values ($1, $2, $3::bigint, 300, 0, $3::bigint + 300, 'paid', 'test', gen_random_uuid()::text, 2027, now())
     returning id`,
    [donorId, charityId, amount],
  );
  return r[0].id as string;
}

describe("public visitor", () => {
  it("sees approved charities only, and no private data", async () => {
    await as("anon", async () => {
      expect(await rows("select id from public.charities")).toHaveLength(3);
      await expect(rows("select * from public.charity_private")).rejects.toThrow(/permission denied/);
      await expect(rows("select * from public.donors")).rejects.toThrow(/permission denied/);
      await expect(rows("select * from public.fee_settings")).rejects.toThrow(/permission denied/);
    });
  });

  it("does not see a charity that is not approved", async () => {
    await client.query("begin");
    try {
      await client.query("update public.charities set status = 'suspended' where id = $1", [ids.shul]);
      await client.query("set local role anon");
      expect(await rows("select id from public.charities")).toHaveLength(2);
    } finally {
      await client.query("rollback");
    }
  });
});

describe("donor", () => {
  it("sees only their own donor identity", async () => {
    await as(ids.donorUser, async () => {
      const r = await rows("select id from public.donors");
      expect(r.map((x) => x.id)).toEqual([ids.donor]);
    });
  });

  it("cannot make themselves a platform admin", async () => {
    await as(ids.donorUser, async () => {
      await expect(
        rows("update public.profiles set role = 'platform_admin' where id = $1", [ids.donorUser]),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it("cannot insert a donation directly", async () => {
    await as(ids.donorUser, async () => {
      await expect(
        rows(
          `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents,
             processing_charge_cents, total_charged_cents, gateway)
           values ($1, $2, 100, 0, 0, 100, 'x')`,
          [ids.donor, ids.meals],
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });
});

describe("charity admin", () => {
  it("sees only their own charity's private details", async () => {
    await as(ids.mealsAdmin, async () => {
      const r = await rows("select charity_id from public.charity_private");
      expect(r.map((x) => x.charity_id)).toEqual([ids.meals]);
    });
  });

  it("can edit their description but not their badges or status", async () => {
    await as(ids.mealsAdmin, async () => {
      await rows("update public.charities set description_en = 'Updated' where id = $1", [ids.meals]);
      await expect(
        rows("update public.charities set is_s18a = false where id = $1", [ids.meals]),
      ).rejects.toThrow(/Only a platform admin/);
      await expect(
        rows("update public.charities set status = 'suspended' where id = $1", [ids.meals]),
      ).rejects.toThrow(/Only a platform admin/);
    });
  });

  it("cannot edit another charity", async () => {
    await as(ids.mealsAdmin, async () => {
      const r = await client.query("update public.charities set description_en = 'x' where id = $1", [ids.shul]);
      expect(r.rowCount).toBe(0);
    });
  });

  it("sees donations for their charity only, through the charity view, and no longer reads the raw tables", async () => {
    await client.query("begin");
    try {
      const donationId = await insertDonation(ids.company, ids.meals);
      await client.query(
        "insert into public.donation_checkout_details (donation_id, donor_type, email, organisation_name) values ($1, 'company', 'a@test.test', 'Test Trading')",
        [donationId],
      );
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: ids.mealsAdmin, role: "authenticated", aal: "aal2" }),
      ]);
      const seen = await rows("select * from public.charity_donations");
      expect(seen.map((x) => x.id)).toEqual([donationId]);
      // The raw tables are closed to a charity admin (donors and platform admins only).
      expect(await rows("select id from public.donations")).toHaveLength(0);
      expect(await rows("select id from public.donors")).toHaveLength(0);
      expect(await rows("select * from public.donation_checkout_details")).toHaveLength(0);
      // Fees, gateway data and the giving kind are not in the view.
      for (const hidden of ["platform_fee_cents", "fee_vat_cents", "processing_charge_cents", "total_charged_cents", "gateway", "gateway_ref", "giving_kind"]) {
        expect(Object.keys(seen[0])).not.toContain(hidden);
      }

      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: ids.shulAdmin, role: "authenticated", aal: "aal2" }),
      ]);
      expect(await rows("select id from public.charity_donations")).toHaveLength(0);
    } finally {
      await client.query("rollback");
    }
  });

  it("never sees a donor's private note", async () => {
    await client.query("begin");
    try {
      const donationId = await insertDonation(ids.donor, ids.meals);
      await client.query(
        "insert into public.donation_private_notes (donation_id, user_id, note) values ($1, $2, 'my note')",
        [donationId, ids.donorUser],
      );
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: ids.mealsAdmin, role: "authenticated", aal: "aal2" }),
      ]);
      expect(await rows("select * from public.donation_private_notes")).toHaveLength(0);
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: ids.donorUser, role: "authenticated", aal: "aal2" }),
      ]);
      expect(await rows("select * from public.donation_private_notes")).toHaveLength(1);
    } finally {
      await client.query("rollback");
    }
  });
});

describe("platform admin", () => {
  it("sees every charity's private details and fee settings", async () => {
    await as(ids.admin, async () => {
      expect(await rows("select charity_id from public.charity_private")).toHaveLength(3);
      expect(await rows("select id from public.fee_settings")).toHaveLength(1);
    });
  });
});

describe("money constraints", () => {
  it("rejects a donation whose split does not add up to the total", async () => {
    await as(null, async () => {
      await expect(
        rows(
          `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents,
             processing_charge_cents, total_charged_cents, gateway)
           values ($1, $2, 10000, 300, 50, 10349, 'test')`,
          [ids.donor, ids.meals],
        ),
      ).rejects.toThrow(/split_adds_up/);
    });
  });

  it("requires paid_at and tax_year on a paid donation", async () => {
    await as(null, async () => {
      await expect(
        rows(
          `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents,
             processing_charge_cents, total_charged_cents, gateway, status)
           values ($1, $2, 10000, 300, 0, 10300, 'test', 'paid')`,
          [ids.donor, ids.meals],
        ),
      ).rejects.toThrow(/paid_has_tax_year/);
    });
  });

  it("seeds the legacy fee settings row with no platform fee and gateway rates empty", async () => {
    const [fees] = await rows("select * from public.fee_settings");
    expect(fees.platform_fee_ppm).toBe(0);
    expect(fees.min_donation_cents).toBe("3000");
    expect(fees.gateway_percent_ppm).toBeNull();
    expect(fees.gateway_fixed_cents).toBeNull();
    expect(fees.vat_enabled).toBe(false);
    expect(fees.vat_rate_ppm).toBe(150_000);
  });
});

describe("s18A receipts", () => {
  async function issueReceipt(charityId: string, donorId: string) {
    const [{ n }] = await rows("select public.next_receipt_number($1) as n", [charityId]);
    const [r] = await rows(
      `insert into public.s18a_receipts (charity_id, receipt_number, donor_id, tax_year, amount_cents, details)
       values ($1, $2, $3, 2027, 10000, '{}') returning id, receipt_number`,
      [charityId, n, donorId],
    );
    return r;
  }

  it("numbers receipts sequentially per charity", async () => {
    await as(null, async () => {
      const a = await issueReceipt(ids.meals, ids.donor);
      const b = await issueReceipt(ids.meals, ids.company);
      expect(b.receipt_number).toBe(a.receipt_number + 1);
    });
  });

  it("cannot be changed or deleted, only voided with a reason", async () => {
    await as(null, async () => {
      const r = await issueReceipt(ids.meals, ids.donor);
      await expect(
        rows("update public.s18a_receipts set amount_cents = 1 where id = $1", [r.id]),
      ).rejects.toThrow(/immutable/);
      await expect(rows("delete from public.s18a_receipts where id = $1", [r.id])).rejects.toThrow(/never deleted/);
      await expect(
        rows("update public.s18a_receipts set status = 'void' where id = $1", [r.id]),
      ).rejects.toThrow(/void_has_reason/);
      await rows(
        "update public.s18a_receipts set status = 'void', voided_at = now(), void_reason = 'Refund' where id = $1",
        [r.id],
      );
      await expect(
        rows("update public.s18a_receipts set void_reason = 'changed' where id = $1", [r.id]),
      ).rejects.toThrow(/void receipt cannot be changed/);
    });
  });

  it("allows only one issued receipt per donor, charity and tax year", async () => {
    await as(null, async () => {
      await issueReceipt(ids.meals, ids.donor);
      await expect(issueReceipt(ids.meals, ids.donor)).rejects.toThrow(/receipts_one_issued_per_donor_year/);
    });
  });

  it("is invisible to other charities' admins", async () => {
    await client.query("begin");
    try {
      const [{ n }] = await rows("select public.next_receipt_number($1) as n", [ids.meals]);
      await rows(
        `insert into public.s18a_receipts (charity_id, receipt_number, donor_id, tax_year, amount_cents, details)
         values ($1, $2, $3, 2027, 10000, '{}')`,
        [ids.meals, n, ids.donor],
      );
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: ids.shulAdmin, role: "authenticated", aal: "aal2" }),
      ]);
      expect(await rows("select id from public.s18a_receipts")).toHaveLength(0);
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: ids.donorUser, role: "authenticated", aal: "aal2" }),
      ]);
      expect(await rows("select id from public.s18a_receipts")).toHaveLength(1);
    } finally {
      await client.query("rollback");
    }
  });
});

describe("audit log", () => {
  it("is append-only", async () => {
    await as(null, async () => {
      const [r] = await rows(
        "insert into public.audit_log (action, entity_type) values ('test', 'test') returning id",
      );
      await expect(rows("update public.audit_log set action = 'x' where id = $1", [r.id])).rejects.toThrow(
        /append-only/,
      );
      await expect(rows("delete from public.audit_log where id = $1", [r.id])).rejects.toThrow(/append-only/);
    });
  });
});
