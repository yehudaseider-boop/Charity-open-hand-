/**
 * Partial refunds and holds in the database (migration 20261120000001, 20/11/2026): issue_s18a_receipt certifies what
 * is left of each gift (R1 000 refunded R400 is receipted for R600), refuses a held gift and one refunded in full;
 * record_partial_refund counts each refund once and never past the gift; browsers can't write refunded_cents,
 * receipt_hold or the refunds list, nor run the function. Fixtures are built in a transaction that is rolled back.
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
/** One statement expected to fail, without breaking the surrounding transaction. */
async function refused(sql: string, args: unknown[], pattern: RegExp) {
  await run("savepoint attempt");
  await expect(run(sql, args)).rejects.toThrow(pattern);
  await run("rollback to savepoint attempt");
}

let seq = 0;
const stamp = () => `${++seq}-${Date.now()}`;
async function charity() {
  const { id } = await one(
    `insert into public.charities (slug, quickgive_code, name_en, legal_name_en, status, is_s18a, s18a_reference, mandate_signed_at)
     values ($1, $2, 'Test', 'Test NPC', 'approved', true, 's18A/1', '2026-03-09T00:00:00+02:00') returning id`,
    [`pr-${stamp()}`, `P${seq}${String(Date.now()).slice(-5)}`],
  );
  return id as string;
}
async function donor() {
  const { id } = await one(`insert into public.donors (email, donor_type, age_confirmed_18_at, popia_consent_at) values ($1, 'individual', now(), now()) returning id`, [`pr${stamp()}@x.test`]);
  return id as string;
}
async function gift(c: string, d: string, amount: number) {
  const { id } = await one(
    `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, total_charged_cents,
       gateway, gateway_ref, wants_18a, status, paid_at, tax_year)
     values ($1, $2, $3, 0, 0, $3, 'test', gen_random_uuid()::text, true, 'paid', '2026-10-01T10:00:00Z', 2027) returning id`,
    [d, c, amount],
  );
  return id as string;
}
const refund = async (id: string, cents: number, source: string) =>
  (await one("select public.record_partial_refund($1, $2::bigint, $3) as outcome", [id, cents, source])).outcome as string;
const issueSql = "select * from public.issue_s18a_receipt($1, $2, 2027, $3::uuid[], 'PRT', '{}'::jsonb)";

describe("partial refunds on s18A receipts", () => {
  it("a R1 000 gift refunded R400 is receipted for R600", async () => {
    await tx(async () => {
      const c = await charity(), d = await donor();
      const g = await gift(c, d, 100_000);
      expect(await refund(g, 40_000, "gateway_event:a")).toBe("done");
      const r = (await run(issueSql, [c, d, [g]])).rows[0];
      expect(Number(r.amount_cents)).toBe(60_000);
      const stored = await one("select amount_cents, details from public.s18a_receipts where id = $1", [r.receipt_id]);
      expect(Number(stored.amount_cents)).toBe(60_000);
      expect(Number(stored.details.amount_cents)).toBe(60_000);
    });
  });

  it("counts a refund once per source, never past the gift, and only on a paid gift", async () => {
    await tx(async () => {
      const c = await charity(), d = await donor();
      const g = await gift(c, d, 100_000);
      expect(await refund(g, 40_000, "gateway_event:a")).toBe("done");
      expect(await refund(g, 40_000, "gateway_event:a")).toBe("already");
      expect(await refund(g, 60_001, "admin:b")).toBe("too_much");
      expect(Number((await one("select refunded_cents from public.donations where id = $1", [g])).refunded_cents)).toBe(40_000);
      expect(Number((await one("select count(*) from public.donation_refunds where donation_id = $1", [g])).count)).toBe(1);
      expect(await refund("00000000-0000-4000-8000-000000000000", 100, "admin:c")).toBe("not_found");
      await refused("select public.record_partial_refund($1, 0, 'admin:d')", [g], /more than R0/);
      // The table itself refuses more than the gift, whatever writes it.
      await refused("update public.donations set refunded_cents = amount_cents + 1 where id = $1", [g], /donations_refunded_cents_range/);
      await run("update public.donations set status = 'refunded', refunded_at = now() where id = $1", [g]);
      expect(await refund(g, 100, "admin:e")).toBe("not_paid");
    });
  });

  it("refuses a held gift and one refunded in full; the same gift is receipted once the hold is released", async () => {
    await tx(async () => {
      const c = await charity(), d = await donor();
      const held = await gift(c, d, 50_000);
      const gone = await gift(c, d, 10_000);
      const fine = await gift(c, d, 20_000);
      await run("update public.donations set receipt_hold = 'dispute open' where id = $1", [held]);
      expect(await refund(gone, 10_000, "admin:all")).toBe("done");
      await refused(issueSql, [c, d, [held, fine]], /not eligible/);
      await refused(issueSql, [c, d, [gone, fine]], /not eligible/);
      await run("update public.donations set receipt_hold = null where id = $1", [held]);
      const r = (await run(issueSql, [c, d, [held, fine]])).rows[0];
      expect(Number(r.amount_cents)).toBe(70_000);
    });
  });
});

describe("browsers", () => {
  it("cannot write refunded_cents or receipt_hold, nor touch the refunds list or run the function", async () => {
    for (const role of ["authenticated", "anon"]) {
      for (const col of ["refunded_cents", "receipt_hold"]) {
        const can = await one("select has_column_privilege($1, 'public.donations', $2, 'update') as u, has_column_privilege($1, 'public.donations', $2, 'insert') as i", [role, col]);
        expect(can).toEqual({ u: false, i: false });
      }
      const t = await one(
        "select has_table_privilege($1, 'public.donation_refunds', 'select') or has_table_privilege($1, 'public.donation_refunds', 'insert') or has_table_privilege($1, 'public.donation_refunds', 'update') or has_table_privilege($1, 'public.donation_refunds', 'delete') as any",
        [role],
      );
      expect(t.any).toBe(false);
      expect((await one("select has_function_privilege($1, 'public.record_partial_refund(uuid, bigint, text, uuid, text)', 'execute') as x", [role])).x).toBe(false);
    }
    expect((await one("select relrowsecurity from pg_class where oid = 'public.donation_refunds'::regclass")).relrowsecurity).toBe(true);
  });

  it("a signed-in person's update of their own gift is refused", async () => {
    await tx(async () => {
      const c = await charity(), d = await donor();
      const g = await gift(c, d, 100_000);
      const { id: u } = await one("insert into auth.users (id, email, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated') returning id", [`pru${stamp()}@x.test`]);
      await run("set local role authenticated");
      await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: u, role: "authenticated", aal: "aal2", amr: [{ method: "otp" }] })]);
      await refused("update public.donations set refunded_cents = 0, receipt_hold = null where id = $1", [g], /permission denied/);
      await refused("select public.record_partial_refund($1, 100, 'browser:x')", [g], /permission denied/);
      await run("reset role");
    });
  });
});

describe("a receipt and a part refund at the same moment (migration 20261120000002)", () => {
  const withLines = (cents: number[]) => JSON.stringify({ donations: cents.map((c) => ({ date: "01/10/2026", amount_cents: c })) });
  const issueWith = "select * from public.issue_s18a_receipt($1, $2, 2027, $3::uuid[], 'PRT', $4::jsonb)";

  it("refuses a receipt whose printed lines still show the gift before a part refund", async () => {
    await tx(async () => {
      const c = await charity(), d = await donor();
      const g = await gift(c, d, 100_000);
      // The run read R1 000; a R400 refund was recorded before the receipt was issued.
      expect(await refund(g, 40_000, "gateway_event:race")).toBe("done");
      await refused(issueWith, [c, d, [g], withLines([100_000])], /do not add up/);
      // Read again, the line says R600 and the receipt is issued for R600.
      const r = (await run(issueWith, [c, d, [g], withLines([60_000])])).rows[0];
      expect(Number(r.amount_cents)).toBe(60_000);
    });
  });

  it("refuses lines that leave a gift out", async () => {
    await tx(async () => {
      const c = await charity(), d = await donor();
      const a = await gift(c, d, 10_000), b = await gift(c, d, 20_000);
      await refused(issueWith, [c, d, [a, b], withLines([30_000])], /do not add up/);
    });
  });

  it("a part refund recorded after a receipt is timed after it, so the receipt is withdrawn, never kept", async () => {
    await tx(async () => {
      const c = await charity(), d = await donor();
      const g = await gift(c, d, 100_000);
      const r = (await run(issueWith, [c, d, [g], withLines([100_000])])).rows[0];
      expect(await refund(g, 40_000, "gateway_event:later")).toBe("done");
      const t = await one(
        "select (select created_at from public.donation_refunds where source = 'gateway_event:later') > (select issued_at from public.s18a_receipts where id = $1) as later",
        [r.receipt_id],
      );
      // Both in one transaction here, so transaction start times would be equal; the clock keeps them in order.
      expect(t.later).toBe(true);
    });
  });
});
