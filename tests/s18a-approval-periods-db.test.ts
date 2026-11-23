/**
 * s18A approval periods in the database (migration 20261123000001, Yehuda's decision of 23/11/2026): a gift only goes
 * on an s18A receipt if the charity could issue s18A receipts when it was paid. A charity's periods open and close
 * with its s18A status, a re-approval never reaches back over the gap, issue_s18a_receipt refuses a gift paid outside
 * every period, and no browser can read or write the periods. Every fixture is built in a transaction that is rolled
 * back, so no seeded data is needed.
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
async function charity(over: { s18a?: boolean; confirmed?: string | null; mandate?: string | null } = {}) {
  const s18a = over.s18a ?? true;
  const { id } = await one(
    `insert into public.charities (slug, quickgive_code, name_en, legal_name_en, status, is_s18a, s18a_reference, s18a_confirmed_at, mandate_signed_at)
     values ($1, $2, 'Test', 'Test NPC', 'approved', $3, 's18A/1', $4, $5) returning id`,
    [`ap-${stamp()}`, `A${seq}${String(Date.now()).slice(-5)}`, s18a, over.confirmed ?? null, over.mandate === undefined ? "2026-03-09T00:00:00+02:00" : over.mandate],
  );
  return id as string;
}
async function donor() {
  const { id } = await one(`insert into public.donors (email, donor_type, age_confirmed_18_at, popia_consent_at) values ($1, 'individual', now(), now()) returning id`, [`ap${stamp()}@x.test`]);
  return id as string;
}
async function gift(c: string, d: string, paidAt: string) {
  const { id } = await one(
    `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, total_charged_cents,
       gateway, gateway_ref, wants_18a, status, paid_at, tax_year)
     values ($1, $2, 10000, 0, 0, 10000, 'test', gen_random_uuid()::text, true, 'paid', $3, 2027) returning id`,
    [d, c, paidAt],
  );
  return id as string;
}
const periods = async (c: string) =>
  (await run("select started_at, ended_at from public.charity_s18a_periods where charity_id = $1 order by started_at", [c])).rows as { started_at: Date; ended_at: Date | null }[];
const issueSql = "select * from public.issue_s18a_receipt($1, $2, 2027, $3::uuid[], 'APR', '{}'::jsonb)";

describe("s18A approval periods", () => {
  it("a charity that can issue from the start gets one open period, from when both its approval and mandate were in place", async () => {
    await tx(async () => {
      const c = await charity({ confirmed: "2026-04-01T09:00:00+02:00", mandate: "2026-03-09T00:00:00+02:00" });
      const p = await periods(c);
      expect(p).toHaveLength(1);
      expect(p[0].started_at.toISOString()).toBe("2026-04-01T07:00:00.000Z");
      expect(p[0].ended_at).toBeNull();
      // Without s18A, or without a mandate, there is none.
      expect(await periods(await charity({ s18a: false, mandate: null }))).toHaveLength(0);
      expect(await periods(await charity({ mandate: null }))).toHaveLength(0);
    });
  });

  it("confirming s18A later opens a period then; a gift paid before it is refused, one paid after is receipted", async () => {
    await tx(async () => {
      const c = await charity({ s18a: false, mandate: "2026-03-09T00:00:00+02:00" });
      const d = await donor();
      const before = await gift(c, d, "2026-03-20T10:00:00Z"); // after the mandate, before s18A was confirmed
      const after = await gift(c, d, "2026-04-02T10:00:00Z");
      await run("update public.charities set is_s18a = true, s18a_confirmed_at = '2026-04-01T09:00:00+02:00' where id = $1", [c]);
      expect((await periods(c))[0].started_at.toISOString()).toBe("2026-04-01T07:00:00.000Z");
      await refused(issueSql, [c, d, [before, after]], /not eligible/);
      const r = (await run(issueSql, [c, d, [after]])).rows[0];
      expect(Number(r.amount_cents)).toBe(10000);
    });
  });

  it("removing s18A closes the period; approved again, the new period never reaches back over the gap", async () => {
    await tx(async () => {
      const c = await charity({ confirmed: null, mandate: "2026-03-09T00:00:00+02:00" });
      const d = await donor();
      // "Remove s18A status" (revokeS18a): the open period is closed now.
      await run("update public.charities set is_s18a = false, s18a_confirmed_at = null where id = $1", [c]);
      let p = await periods(c);
      expect(p).toHaveLength(1);
      expect((await one("select ended_at = now() as now from public.charity_s18a_periods where charity_id = $1", [c])).now).toBe(true);
      // Pretend it was removed on 01/06/2026.
      await run("update public.charity_s18a_periods set ended_at = '2026-06-01T00:00:00+02:00' where charity_id = $1", [c]);

      // Approved again, with an s18A confirmation dated in the gap: the new period still starts now.
      await run("update public.charities set is_s18a = true, s18a_confirmed_at = '2026-07-01T00:00:00+02:00' where id = $1", [c]);
      p = await periods(c);
      expect(p).toHaveLength(2);
      expect((await one("select started_at = now() as now from public.charity_s18a_periods where charity_id = $1 and ended_at is null", [c])).now).toBe(true);
      // Pretend it was approved again on 01/09/2026.
      await run("update public.charity_s18a_periods set started_at = '2026-09-01T00:00:00+02:00' where charity_id = $1 and ended_at is null", [c]);

      const first = await gift(c, d, "2026-05-01T10:00:00Z");
      const gap = await gift(c, d, "2026-07-15T10:00:00Z");
      const second = await gift(c, d, "2026-10-01T10:00:00Z");
      // Paid while the charity couldn't issue: never on a receipt, even now it can again.
      await refused(issueSql, [c, d, [gap]], /not eligible/);
      await refused(issueSql, [c, d, [first, gap, second]], /not eligible/);
      const r = (await run(issueSql, [c, d, [first, second]])).rows[0];
      expect(Number(r.amount_cents)).toBe(20000);
    });
  });

  it("a period includes its first moment, not its last", async () => {
    await tx(async () => {
      const c = await charity();
      await run("update public.charity_s18a_periods set started_at = '2026-04-01T00:00:00Z', ended_at = '2026-05-01T00:00:00Z' where charity_id = $1", [c]);
      const at = async (t: string) => (await one("select public.charity_could_issue_18a_at($1, $2) as ok", [c, t])).ok;
      expect(await at("2026-03-31T23:59:59Z")).toBe(false);
      expect(await at("2026-04-01T00:00:00Z")).toBe(true);
      expect(await at("2026-04-30T23:59:59Z")).toBe(true);
      expect(await at("2026-05-01T00:00:00Z")).toBe(false);
    });
  });

  it("keeps one open period: changing the mandate while the charity can issue adds none", async () => {
    await tx(async () => {
      const c = await charity();
      await run("update public.charities set mandate_signed_at = '2026-03-10T00:00:00+02:00' where id = $1", [c]);
      await run("update public.charities set is_s18a = true where id = $1", [c]);
      expect(await periods(c)).toHaveLength(1);
      await refused("insert into public.charity_s18a_periods (charity_id, started_at) values ($1, now())", [c], /charity_s18a_periods_one_open/);
      await refused("update public.charity_s18a_periods set ended_at = '2020-01-01' where charity_id = $1", [c], /charity_s18a_period_order/);
    });
  });

  it("the mandate rule still holds inside a period", async () => {
    await tx(async () => {
      const c = await charity({ mandate: "2026-03-09T00:00:00+02:00" });
      const d = await donor();
      // A period that (wrongly) starts before the mandate still never receipts a gift paid before it was signed.
      await run("update public.charity_s18a_periods set started_at = '2026-01-01T00:00:00Z' where charity_id = $1", [c]);
      await refused(issueSql, [c, d, [await gift(c, d, "2026-03-01T10:00:00Z")]], /not eligible/);
    });
  });
});

describe("browsers", () => {
  it("can't read or write the periods, nor run the check", async () => {
    for (const role of ["authenticated", "anon"]) {
      const t = await one(
        "select has_table_privilege($1, 'public.charity_s18a_periods', 'select') or has_table_privilege($1, 'public.charity_s18a_periods', 'insert') or has_table_privilege($1, 'public.charity_s18a_periods', 'update') or has_table_privilege($1, 'public.charity_s18a_periods', 'delete') as any",
        [role],
      );
      expect(t.any).toBe(false);
      expect((await one("select has_function_privilege($1, 'public.charity_could_issue_18a_at(uuid, timestamptz)', 'execute') as x", [role])).x).toBe(false);
    }
    expect((await one("select relrowsecurity from pg_class where oid = 'public.charity_s18a_periods'::regclass")).relrowsecurity).toBe(true);
    const policy = await one("select permissive from pg_policies where schemaname = 'public' and tablename = 'charity_s18a_periods' and policyname = 'no_password_sessions'");
    expect(policy.permissive).toBe("RESTRICTIVE");
  });

  it("a signed-in person is refused", async () => {
    await tx(async () => {
      const c = await charity();
      const { id: u } = await one("insert into auth.users (id, email, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated') returning id", [`apu${stamp()}@x.test`]);
      await run("set local role authenticated");
      await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: u, role: "authenticated", aal: "aal2", amr: [{ method: "otp" }] })]);
      await refused("select * from public.charity_s18a_periods", [], /permission denied/);
      await refused("insert into public.charity_s18a_periods (charity_id, started_at) values ($1, '2020-01-01')", [c], /permission denied/);
      await run("reset role");
    });
  });
});
