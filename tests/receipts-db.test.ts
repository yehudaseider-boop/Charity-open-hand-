/**
 * Issuing s18A receipts in the database. Builds its own fixtures inside a
 * transaction that is rolled back, so it needs only the migrations applied
 * (the local Supabase). Run: npm test
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
async function charity(over: { s18a?: boolean; mandate?: string | null } = {}) {
  const n = ++seq;
  const mandate = over.mandate === undefined ? "2026-03-09T00:00:00+02:00" : over.mandate;
  const { id } = await one(
    `insert into public.charities (slug, quickgive_code, name_en, legal_name_en, status, is_s18a, s18a_reference, mandate_signed_at)
     values ($1, $2, 'Test', 'Test NPC', 'approved', $3, $4, $5) returning id`,
    [`t-${n}-${Date.now()}`, `T${n}${String(Date.now()).slice(-5)}`, over.s18a ?? true, (over.s18a ?? true) ? "18A/1" : null, mandate],
  );
  return id as string;
}
async function donor() {
  const n = ++seq;
  const { id } = await one(
    `insert into public.donors (email, donor_type, age_confirmed_18_at, popia_consent_at) values ($1, 'individual', now(), now()) returning id`,
    [`d${n}-${Date.now()}@x.test`],
  );
  return id as string;
}
async function donation(c: string, d: string, o: { amount?: number; fee?: number; status?: string; year?: number; wants18a?: boolean; paidAt?: string } = {}) {
  const amount = o.amount ?? 50_000;
  const fee = o.fee ?? 2_000;
  const status = o.status ?? "paid";
  const { id } = await one(
    `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, total_charged_cents,
       gateway, gateway_ref, wants_18a, status, paid_at, tax_year)
     values ($1, $2, $3, $4, 0, $5, 'test', gen_random_uuid()::text, $6, $7, $8, $9) returning id`,
    [d, c, amount, fee, amount + fee, o.wants18a ?? true, status, status === "paid" ? (o.paidAt ?? "2026-10-01T10:00:00Z") : null, status === "paid" ? (o.year ?? 2027) : null],
  );
  return id as string;
}
const issue = (c: string, d: string, ids: string[], year = 2027) =>
  run("select * from public.issue_s18a_receipt($1, $2, $3, $4::uuid[], 'LTC', '{}'::jsonb)", [c, d, year, ids]);

/** Run one attempt that is expected to fail, without breaking the surrounding transaction. */
async function refused(c: string, d: string, ids: string[], pattern: RegExp, year = 2027) {
  await run("savepoint attempt");
  await expect(issue(c, d, ids, year)).rejects.toThrow(pattern);
  await run("rollback to savepoint attempt");
}

describe("issue_s18a_receipt", () => {
  it("issues a numbered receipt for the gift amounts only, and links the donations", async () => {
    await tx(async () => {
      const c = await charity(), d = await donor();
      const a = await donation(c, d, { amount: 50_000, fee: 1_900 });
      const b = await donation(c, d, { amount: 18_000, fee: 700 });
      const r = (await issue(c, d, [a, b])).rows[0];
      expect(r.receipt_number).toBe(1);
      expect(r.receipt_reference).toBe("LTC-2027-0001");
      expect(Number(r.amount_cents)).toBe(68_000);
      const links = await run("select donation_id from public.s18a_receipt_donations where receipt_id = $1", [r.receipt_id]);
      expect(links.rows.map((x) => x.donation_id).sort()).toEqual([a, b].sort());
      const stored = await one("select details from public.s18a_receipts where id = $1", [r.receipt_id]);
      expect(stored.details.receipt_reference).toBe("LTC-2027-0001");
    });
  });

  it("numbers receipts in order for each charity", async () => {
    await tx(async () => {
      const c = await charity(), d1 = await donor(), d2 = await donor();
      const r1 = (await issue(c, d1, [await donation(c, d1)])).rows[0];
      const r2 = (await issue(c, d2, [await donation(c, d2)])).rows[0];
      expect([r1.receipt_number, r2.receipt_number]).toEqual([1, 2]);
      const other = await charity();
      const r3 = (await issue(other, d1, [await donation(other, d1)])).rows[0];
      expect(r3.receipt_number).toBe(1);
    });
  });

  it("refuses what is not eligible, and uses up no receipt number", async () => {
    await tx(async () => {
      const c = await charity(), d = await donor(), other = await donor();
      await refused(c, d, [await donation(c, d, { status: "pending" })], /not eligible/);
      await refused(c, d, [await donation(c, d, { status: "refunded", paidAt: "2026-10-01T10:00:00Z" })], /not eligible/);
      await refused(c, d, [await donation(c, other)], /not eligible/); // someone else's donation
      await refused(c, d, [await donation(c, d, { year: 2026 })], /not eligible/); // wrong tax year
      await refused(c, d, [await donation(c, d, { wants18a: false })], /not eligible/);
      await refused(c, d, [await donation(c, d, { paidAt: "2026-03-01T10:00:00Z" })], /not eligible/); // before the mandate was signed
      await refused(c, d, [], /at least one/);
      const dup = await donation(c, d);
      await refused(c, d, [dup, dup], /twice/);
      await refused(c, d, ["00000000-0000-0000-0000-000000000000"], /does not exist/);
      // None of that used a number: the first real receipt is still number 1.
      expect((await issue(c, d, [await donation(c, d)])).rows[0].receipt_number).toBe(1);
    });
  });

  it("refuses a charity without s18A approval or a signed mandate", async () => {
    await tx(async () => {
      const d = await donor();
      const noApproval = await charity({ s18a: false });
      await refused(noApproval, d, [await donation(noApproval, d)], /cannot issue/);
      const noMandate = await charity({ mandate: null });
      await refused(noMandate, d, [await donation(noMandate, d)], /cannot issue/);
    });
  });

  it("never puts the same donation on two issued receipts, or two receipts for one donor and year", async () => {
    await tx(async () => {
      const c = await charity(), d = await donor();
      const a = await donation(c, d);
      await issue(c, d, [a]);
      await refused(c, d, [a], /not eligible/);
      await refused(c, d, [await donation(c, d)], /receipts_one_issued_per_donor_year/);
    });
  });

  it("lets a voided receipt be issued again", async () => {
    await tx(async () => {
      const c = await charity(), d = await donor();
      const a = await donation(c, d);
      const first = (await issue(c, d, [a])).rows[0];
      await run("update public.s18a_receipts set status = 'void', voided_at = now(), void_reason = 'wrong address' where id = $1", [first.receipt_id]);
      const again = (await issue(c, d, [a])).rows[0];
      expect(again.receipt_number).toBe(2);
    });
  });

  it("can only be called by the server, not by a signed-in user or a visitor", async () => {
    for (const role of ["authenticated", "anon"]) {
      await tx(async () => {
        const c = await charity(), d = await donor();
        const a = await donation(c, d);
        await run(`set local role ${role}`);
        await expect(issue(c, d, [a])).rejects.toThrow(/permission denied/);
      });
    }
  });
});
