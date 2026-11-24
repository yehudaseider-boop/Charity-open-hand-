/**
 * The annual report worked out in the database (charity_report_summary, 24/11/2026), against the real schema: the
 * same figures the page works out from the rows charity_donations gives the same person, for every tax year; closed
 * to anyone not on the charity's team. Builds its own fixtures in a transaction that is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { annualReport, pickReportYear, reportFromSummary, reportYears, toReportSummary, type ReportGift } from "@/lib/charity/annual-report";
import { platformConfig } from "@/config/platform";
import { taxYearFor } from "@/lib/dates";

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

async function user() {
  const { id } = await one("insert into auth.users (id, email, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated') returning id", [`rs${stamp()}@x.test`]);
  return id as string;
}
async function charity(adminUser?: string) {
  const { id } = await one(
    `insert into public.charities (slug, quickgive_code, name_en, legal_name_en, status) values ($1, $2, 'C', 'C NPC', 'approved') returning id`,
    [`rs-${stamp()}`, `R${String(Date.now()).slice(-6)}${seq}`],
  );
  if (adminUser) await run("insert into public.charity_admins (charity_id, user_id, role) values ($1, $2, 'owner')", [id, adminUser]);
  return id as string;
}
async function donor() {
  const { id } = await one(
    `insert into public.donors (email, donor_type, age_confirmed_18_at, popia_consent_at) values ($1, 'individual', now(), now()) returning id`,
    [`rsd${stamp()}@x.test`],
  );
  return id as string;
}
async function gift(c: string, d: string, amount: number, paidAt: string, o: { status?: string; refunded?: number; wants18a?: boolean } = {}) {
  const { id } = await one(
    `insert into public.donations (donor_id, charity_id, amount_cents, refunded_cents, platform_fee_cents, processing_charge_cents, total_charged_cents, gateway, gateway_ref, status, paid_at, tax_year, wants_18a)
     values ($1, $2, $3::bigint, $4::bigint, 400, 100, $3::bigint + 500, 'test', gen_random_uuid()::text, $5, $6, $7, $8) returning id`,
    [d, c, amount, o.refunded ?? 0, o.status ?? "paid", paidAt, taxYearFor(paidAt), o.wants18a ?? false],
  );
  await run(
    `insert into public.donation_checkout_details (donation_id, donor_type, email, first_name, last_name, phone) values ($1, 'individual', 'thandi@x.test', 'Thandi', 'Mokoena', '0821234567')`,
    [id],
  );
  return id as string;
}
async function issuedReceipt(c: string, d: string, donation: string) {
  const { id } = await one(
    `insert into public.s18a_receipts (charity_id, receipt_number, donor_id, tax_year, amount_cents, status, details) values ($1, $2, $3, 2026, 10000, 'issued', '{"receipt_reference":"RS-1","donor":{"name":"Thandi"}}'::jsonb) returning id`,
    [c, 900 + seq++, d],
  );
  await run("insert into public.s18a_receipt_donations (receipt_id, donation_id) values ($1, $2)", [id, donation]);
}
const asUser = async (id: string) => {
  await run("set local role authenticated");
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated", aal: "aal2", amr: [{ method: "otp" }] })]);
};
const summary = (c: string, asked: number | null, now: Date) =>
  one("select public.charity_report_summary($1, $2, $3, $4, $5) as s", [c, asked, taxYearFor(now), platformConfig.taxYear.startMonth, platformConfig.timeZone]).then((r) => toReportSummary(r.s));

describe("charity_report_summary", () => {
  it("gives the page's own figures, for every tax year, from the rows the page would read", async () => {
    await tx(async () => {
      const a = await user();
      const c = await charity(a);
      const other = await charity();
      const old = await donor(), late = await donor(), fresh = await donor(), parts = await donor();
      const now = new Date("2026-11-24T10:00:00Z");
      const asked = await gift(c, old, 50_000, "2025-06-01T10:00:00Z", { wants18a: true }); // tax year 2026
      await issuedReceipt(c, old, asked);
      await gift(c, old, 18_000, "2026-03-01T08:00:00Z", { wants18a: true }); // 2027, not yet receipted
      await gift(c, late, 30_000, "2026-02-28T21:59:59Z"); // 23:59:59 on 28/02 in Johannesburg: still 2026
      await gift(c, late, 12_000, "2026-02-28T22:00:00Z"); // midnight, 1 March: 2027
      await gift(c, fresh, 100_000, "2026-04-20T09:00:00Z", { refunded: 40_000 });
      await gift(c, fresh, 25_000, "2026-05-02T09:00:00Z", { status: "refunded" });
      await gift(c, parts, 7_000, "2026-06-02T09:00:00Z", { refunded: 7_000 }); // refunded in full in parts: no gift
      await gift(c, parts, 9_000, "2024-07-02T09:00:00Z", { status: "charged_back" });
      await gift(other, fresh, 999_999, "2026-04-20T09:00:00Z"); // another charity's gift: never counted

      await asUser(a);
      const rows: ReportGift[] = (await run(
        "select id, donor_id, status::text, amount_cents, refunded_cents, paid_at, tax_year, recurring_id, campaign_id, wants_18a from public.charity_donations where charity_id = $1 order by id",
        [c],
      )).rows.map((g) => ({ ...g, amount_cents: Number(g.amount_cents), refunded_cents: Number(g.refunded_cents), paid_at: g.paid_at ? new Date(g.paid_at).toISOString() : null }));
      const onIssued = new Set<string>((await run("select donation_id from public.charity_receipt_donations where charity_id = $1 and status = 'issued'", [c])).rows.map((r) => r.donation_id));
      const years = reportYears(rows, now);
      expect(years).toEqual([2027, 2026, 2025]);
      for (const y of [null, 0, ...years]) {
        const s = await summary(c, y, now);
        const year = pickReportYear(years, y ?? NaN);
        expect(s.years).toEqual(years);
        expect(s.taxYear).toBe(year);
        expect(reportFromSummary(s, new Map(), now)).toEqual(annualReport(rows, year, new Map(), onIssued, now));
      }
      const r = reportFromSummary(await summary(c, 2027, now), new Map(), now);
      expect(r).toMatchObject({ totalCents: 90_000, donationCount: 3, donors: 3, newDonors: 1, refunded: { count: 3, cents: 72_000 } });
    });
  });

  it("is closed to someone not on the charity's team, and to anyone not signed in", async () => {
    await tx(async () => {
      const a = await user();
      const c = await charity(a);
      const stranger = await user();
      await asUser(stranger);
      await run("savepoint s");
      await expect(summary(c, null, new Date())).rejects.toThrow(/Not allowed/);
      await run("rollback to savepoint s");
      await run("reset role");
      await run("set local role anon");
      await expect(summary(c, null, new Date())).rejects.toThrow(/permission denied/);
    });
  });
});
