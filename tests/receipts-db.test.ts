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

async function user(email: string) {
  const { id } = await one("insert into auth.users (id, email, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated') returning id", [email]);
  return id as string;
}
const asUser = async (id: string) => {
  await run("set local role authenticated");
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated", aal: "aal2" })]);
};

describe("link_donors_to_user", () => {
  it("links donors that used the address, whatever the capital letters, and says how many", async () => {
    await tx(async () => {
      const email = `link-${Date.now()}@Example.co.za`;
      const u = await user(email.toLowerCase());
      await run(`insert into public.donors (email, donor_type, age_confirmed_18_at, popia_consent_at) values ($1, 'individual', now(), now())`, [email]);
      await run(`insert into public.donors (email, donor_type, organisation_name, registration_number, age_confirmed_18_at, popia_consent_at) values ($1, 'company', 'Co', '2020/1', now(), now())`, [email.toUpperCase()]);
      const n = (await one("select public.link_donors_to_user($1, $2) as n", [u, email.toLowerCase()])).n;
      expect(n).toBe(2);
      const linked = await run("select user_id, email_verified_at from public.donors where user_id = $1", [u]);
      expect(linked.rows).toHaveLength(2);
      expect(linked.rows.every((r) => r.email_verified_at)).toBe(true);
    });
  });

  it("never takes a donor away from the account it already belongs to", async () => {
    await tx(async () => {
      const email = `owned-${Date.now()}@example.co.za`;
      const first = await user(`first-${Date.now()}@example.co.za`);
      const second = await user(email);
      await run(`insert into public.donors (email, donor_type, user_id, age_confirmed_18_at, popia_consent_at) values ($1, 'individual', $2, now(), now())`, [email, first]);
      expect((await one("select public.link_donors_to_user($1, $2) as n", [second, email])).n).toBe(0);
      expect((await one("select user_id from public.donors where email = $1", [email])).user_id).toBe(first);
    });
  });

  it("can only be called by the server", async () => {
    for (const role of ["authenticated", "anon"]) {
      await tx(async () => {
        const u = await user(`who-${role}-${Date.now()}@example.co.za`);
        await run(`set local role ${role}`);
        await expect(run("select public.link_donors_to_user($1, 'a@b.co.za')", [u])).rejects.toThrow(/permission denied/);
      });
    }
  });
});

describe("who can read a receipt", () => {
  it("its donor can, a stranger cannot", async () => {
    await tx(async () => {
      const c = await charity(), d = await donor();
      const owner = await user(`owner-${Date.now()}@example.co.za`);
      const stranger = await user(`stranger-${Date.now()}@example.co.za`);
      await run("update public.donors set user_id = $1 where id = $2", [owner, d]);
      const receipt = (await issue(c, d, [await donation(c, d)])).rows[0];

      await asUser(owner);
      expect((await run("select id from public.s18a_receipts where id = $1", [receipt.receipt_id])).rows).toHaveLength(1);
      await run("reset role");
      await asUser(stranger);
      expect((await run("select id from public.s18a_receipts where id = $1", [receipt.receipt_id])).rows).toHaveLength(0);
    });
  });
});

describe("withdrawing and emailing a receipt", () => {
  it("a voided receipt keeps its record and can no longer be changed", async () => {
    await tx(async () => {
      const c = await charity(), d = await donor();
      const r = (await issue(c, d, [await donation(c, d)])).rows[0];
      await run("update public.s18a_receipts set status = 'void', voided_at = now(), void_reason = 'wrong address' where id = $1", [r.receipt_id]);
      expect((await one("select status, void_reason from public.s18a_receipts where id = $1", [r.receipt_id]))).toEqual({ status: "void", void_reason: "wrong address" });
      await run("savepoint s");
      await expect(run("update public.s18a_receipts set pdf_path = 'x' where id = $1", [r.receipt_id])).rejects.toThrow(/void receipt cannot be changed/);
      await run("rollback to savepoint s");
      await expect(run("delete from public.s18a_receipts where id = $1", [r.receipt_id])).rejects.toThrow(/never deleted/);
    });
  });

  it("a void needs a reason", async () => {
    await tx(async () => {
      const c = await charity(), d = await donor();
      const r = (await issue(c, d, [await donation(c, d)])).rows[0];
      await expect(run("update public.s18a_receipts set status = 'void' where id = $1", [r.receipt_id])).rejects.toThrow(/void_has_reason/);
    });
  });

  it("the emailed time can be recorded, but not the numbers or amount", async () => {
    await tx(async () => {
      const c = await charity(), d = await donor();
      const r = (await issue(c, d, [await donation(c, d)])).rows[0];
      await run("update public.s18a_receipts set emailed_at = now() where id = $1", [r.receipt_id]);
      expect((await one("select emailed_at from public.s18a_receipts where id = $1", [r.receipt_id])).emailed_at).not.toBeNull();
      await run("savepoint s");
      await expect(run("update public.s18a_receipts set amount_cents = 1 where id = $1", [r.receipt_id])).rejects.toThrow(/immutable/);
      await run("rollback to savepoint s");
    });
  });
});
