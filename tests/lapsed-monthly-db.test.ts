/**
 * Monthly donors who stopped, as the database answers a charity (charity_lapsed_monthly): stopped but not
 * paused, not a donor who started again, nothing about an erased donor, and closed to everyone else.
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
    [`c-${stamp()}`, `L${String(Date.now()).slice(-6)}${seq}`],
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
type Ended = { status?: "active" | "paused" | "failed" | "cancelled"; amount?: number; endedAt?: string; reason?: string | null };
/** A monthly donation with one payment that went through (so the charity sees it), then ended or not. */
async function monthly(c: string, d: string, o: Ended & { paidAt?: string; paymentStatus?: string; first?: string; last?: string; email?: string } = {}) {
  const status = o.status ?? "cancelled";
  const ended = status === "cancelled" || status === "failed";
  const { id } = await one(
    `insert into public.recurring_donations (donor_id, charity_id, amount_cents, contribution_cents, status, charge_day, next_charge_at,
       authorization_encrypted, card_last4, gateway_customer_ref, cancelled_at, paused_at, ended_reason)
     values ($1, $2, $3, 2000, $4, 15, '2026-11-15T08:00:00Z', 'secret', '4242', 'CUS_x', $5, $6, $7) returning id`,
    [d, c, o.amount ?? 18_000, status, ended ? (o.endedAt ?? "2026-10-20T10:00:00Z") : null, status === "paused" ? "2026-10-20T10:00:00Z" : null,
      ended ? (o.reason === undefined ? "cancelled by the donor" : o.reason) : null],
  );
  const amount = o.amount ?? 18_000;
  const paymentStatus = o.paymentStatus ?? "paid";
  const { id: donationId } = await one(
    `insert into public.donations (donor_id, charity_id, recurring_id, amount_cents, platform_fee_cents, processing_charge_cents, total_charged_cents,
       gateway, gateway_ref, status, paid_at, tax_year)
     values ($1, $2, $3, $4, 400, 100, $5, 'test', gen_random_uuid()::text, $6, $7, 2027) returning id`,
    [d, c, id, amount, amount + 500, paymentStatus, o.paidAt ?? "2026-09-15T08:00:00Z"],
  );
  await run(
    `insert into public.donation_checkout_details (donation_id, donor_type, email, first_name, last_name, phone)
     values ($1, 'individual', $2, $3, $4, '0821234567')`,
    [donationId, o.email ?? "sarah@x.test", o.first ?? "Sarah", o.last ?? "Levin"],
  );
  return id as string;
}
const asUser = async (id: string, claims: Record<string, unknown> = {}) => {
  await run("set local role authenticated");
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated", aal: "aal2", amr: [{ method: "otp" }], ...claims })]);
};
const reset = () => run("reset role");

// This tax year on the day these fixtures are dated: 1 March 2026 to the end of February 2027, Johannesburg time.
const FROM = "2026-03-01T00:00:00+02:00";
const TO = "2027-03-01T00:00:00+02:00";
const list = (c: string, from = FROM, to = TO) => run("select * from public.charity_lapsed_monthly($1, $2, $3)", [c, from, to]).then((r) => r.rows);

describe("monthly donors who stopped", () => {
  it("lists cancelled and stopped monthly donations, newest first, and never a paused or running one", async () => {
    await tx(async () => {
      const a = await user();
      const c = await charity(a);
      const cancelled = await monthly(c, await donor(), { status: "cancelled", endedAt: "2026-10-20T10:00:00Z", amount: 18_000 });
      const declined = await monthly(c, await donor(), { status: "failed", endedAt: "2026-11-01T10:00:00Z", reason: "the card was declined every time we tried this month", amount: 5_000 });
      const dispute = await monthly(c, await donor(), { status: "cancelled", endedAt: "2026-06-01T10:00:00Z", reason: "the payment was charged back", paymentStatus: "charged_back" });
      const unknown = await monthly(c, await donor(), { status: "cancelled", endedAt: "2026-05-01T10:00:00Z", reason: null });
      await monthly(c, await donor(), { status: "paused" });
      await monthly(c, await donor(), { status: "active" });

      await asUser(a);
      const rows = await list(c);
      expect(rows.map((r) => r.recurring_id)).toEqual([declined, cancelled, dispute, unknown]);
      expect(rows.map((r) => r.reason)).toEqual(["declined", "cancelled", "dispute", "other"]);
      expect(rows[1]).toMatchObject({ amount_cents: "18000", display_name: "Sarah Levin", email: "sarah@x.test", phone: "0821234567", donor_type: "individual" });
      expect(new Date(rows[1].ended_at).toISOString()).toBe("2026-10-20T10:00:00.000Z");
      expect(new Date(rows[1].last_paid_at).toISOString()).toBe("2026-09-15T08:00:00.000Z");
      expect(rows[1].donor_id).not.toBeNull();
      // Its only payment was charged back, so there is no donor page to open.
      expect(rows[2].donor_id).toBeNull();
      // The stored reason, the card and the contribution to Givezy stay private.
      for (const hidden of ["ended_reason", "authorization_encrypted", "card_last4", "gateway_customer_ref", "contribution_cents", "failed_attempts"]) {
        expect(Object.keys(rows[0])).not.toContain(hidden);
      }
    });
  });

  it("keeps a declined reason after the donor removes the stopped donation", async () => {
    await tx(async () => {
      const a = await user();
      const c = await charity(a);
      await monthly(c, await donor(), { status: "cancelled", reason: "the card was declined every time we tried this month" });
      await asUser(a);
      expect((await list(c)).map((r) => r.reason)).toEqual(["declined"]);
    });
  });

  it("counts only what ended inside the period: the start is included, the end is not", async () => {
    await tx(async () => {
      const a = await user();
      const c = await charity(a);
      const lastYear = await monthly(c, await donor(), { endedAt: "2026-02-28T21:59:59Z" }); // 23:59:59 on 28 February in Johannesburg
      const firstMoment = await monthly(c, await donor(), { endedAt: "2026-02-28T22:00:00Z" }); // midnight, 1 March
      const nextYear = await monthly(c, await donor(), { endedAt: "2027-02-28T22:00:00Z" });
      await asUser(a);
      expect((await list(c)).map((r) => r.recurring_id)).toEqual([firstMoment]);
      expect((await list(c, "2025-03-01T00:00:00+02:00", FROM)).map((r) => r.recurring_id)).toEqual([lastYear]);
      expect((await list(c, TO, "2028-03-01T00:00:00+02:00")).map((r) => r.recurring_id)).toEqual([nextYear]);
      await run("savepoint s");
      await expect(run("select * from public.charity_lapsed_monthly($1, null, $2)", [c, TO])).rejects.toThrow(/period/);
      await run("rollback to savepoint s");
    });
  });

  it("leaves out a donor who started a new monthly donation later, or still gives monthly another way", async () => {
    await tx(async () => {
      const a = await user();
      const c = await charity(a), elsewhere = await charity();
      const restarted = await donor(), stoppedTwice = await donor(), pausedOther = await donor(), gone = await donor(), givesElsewhere = await donor();

      await monthly(c, restarted, { endedAt: "2026-06-01T10:00:00Z", paidAt: "2026-04-15T08:00:00Z" });
      await monthly(c, restarted, { status: "active", paidAt: "2026-08-15T08:00:00Z" });

      await monthly(c, stoppedTwice, { endedAt: "2026-06-01T10:00:00Z", paidAt: "2026-04-15T08:00:00Z" });
      const second = await monthly(c, stoppedTwice, { endedAt: "2026-10-01T10:00:00Z", paidAt: "2026-08-15T08:00:00Z", amount: 9_000 });

      await monthly(c, pausedOther, { status: "paused", paidAt: "2026-04-15T08:00:00Z" });
      await monthly(c, pausedOther, { endedAt: "2026-09-01T10:00:00Z", paidAt: "2026-08-15T08:00:00Z" });

      const lapsed = await monthly(c, gone, { endedAt: "2026-07-01T10:00:00Z" });
      // A monthly donation to another charity does not make them a monthly donor here.
      const here = await monthly(c, givesElsewhere, { endedAt: "2026-05-01T10:00:00Z", paidAt: "2026-04-15T08:00:00Z" });
      await monthly(elsewhere, givesElsewhere, { status: "active", paidAt: "2026-08-15T08:00:00Z" });

      await asUser(a);
      const rows = await list(c);
      expect(rows.map((r) => r.recurring_id)).toEqual([second, lapsed, here]);
      expect(rows[0].amount_cents).toBe("9000");
    });
  });

  it("a new monthly donation only counts as starting again once a payment has gone through", async () => {
    await tx(async () => {
      const a = await user();
      const c = await charity(a);
      const d = await donor();
      const stopped = await monthly(c, d, { endedAt: "2026-06-01T10:00:00Z" });
      await run(
        `insert into public.recurring_donations (donor_id, charity_id, amount_cents, contribution_cents, status, charge_day) values ($1, $2, 18000, 0, 'pending', 15)`,
        [d, c],
      );
      await asUser(a);
      expect((await list(c)).map((r) => r.recurring_id)).toEqual([stopped]);
    });
  });

  it("shows nothing about an erased donor: the amount, the end date and the reason only", async () => {
    await tx(async () => {
      const a = await user();
      const c = await charity(a);
      const d = await donor(), kept = await donor();
      const erased = await monthly(c, d, { status: "active", amount: 12_000 });
      // Details kept for SARS on an issued s18A receipt (names stay on the checkout row) still never reach this list.
      const keptNames = await monthly(c, kept, { status: "failed", endedAt: "2026-08-01T10:00:00Z", reason: "the card was declined every time we tried this month" });
      await run("select public.erase_donor_data(array[$1]::uuid[])", [d]);
      await run(
        `update public.donation_checkout_details set email = 'erased+' || donation_id::text || '@erased.invalid'
         where donation_id in (select id from public.donations where recurring_id = $1)`,
        [keptNames],
      );

      await asUser(a);
      const rows = await list(c, "2026-03-01T00:00:00+02:00", "2100-01-01T00:00:00+02:00");
      expect(rows.map((r) => r.recurring_id).sort()).toEqual([erased, keptNames].sort());
      for (const r of rows) {
        expect(r).toMatchObject({ reason: "erased", donor_id: null, display_name: null, email: null, phone: null, donor_type: null, last_paid_at: null });
        expect(r.ended_at).not.toBeNull();
      }
      expect(rows.find((r) => r.recurring_id === erased).amount_cents).toBe("12000");
    });
  });

  it("refuses another charity's admin, a stranger, a visitor, a session without the second step and one started with a password", async () => {
    await tx(async () => {
      const a = await user(), b = await user(), stranger = await user(), admin = await user("platform_admin");
      const ca = await charity(a), cb = await charity(b);
      const mine = await monthly(ca, await donor());
      await monthly(cb, await donor());

      const refused = async (c: string, pattern: RegExp) => {
        await run("savepoint s");
        await expect(list(c)).rejects.toThrow(pattern);
        await run("rollback to savepoint s");
      };

      await asUser(a);
      expect((await list(ca)).map((r) => r.recurring_id)).toEqual([mine]);
      await refused(cb, /Not allowed/);
      expect((await run("select id from public.recurring_donations")).rowCount).toBe(0);

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
      expect((await list(ca)).map((r) => r.recurring_id)).toEqual([mine]);

      await reset();
      await run("set local role anon");
      await refused(ca, /permission denied/);
    });
  });
});
