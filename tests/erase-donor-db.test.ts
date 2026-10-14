/**
 * Erasing a donor (POPIA): what goes, what the law makes us keep, and who may run it.
 * Needs the local Supabase, seeded.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
let ids: Record<string, string>;

beforeAll(async () => {
  await client.connect();
  const one = async (sql: string, a: unknown[]) => (await run(sql, a)).rows[0].id as string;
  ids = {
    donorUser: await one("select id from auth.users where email = $1", ["donor@nedivlev.test"]),
    donor: await one("select id from public.donors where email = $1", ["donor@nedivlev.test"]),
    meals: await one("select id from public.charities where slug = $1", ["northcliff-meals-fund"]),
  };
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

/** A donor with a paid, receipted donation, a monthly donation, a private choice and raw gateway records. */
async function world() {
  await run("reset role");
  const donor = (
    await run(
      `insert into public.donors (email, first_name, last_name, phone, id_number_encrypted, id_number_last4, address_line1, user_id)
       values ('erase-me@example.co.za', 'Erin', 'Case', '0821234567', 'v1.x.y.z', '1234', '1 Test Road', null) returning id`,
    )
  ).rows[0].id as string;
  const ref = (await run("select gen_random_uuid()::text as r")).rows[0].r as string;
  const don = (
    await run(
      `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, contribution_cents, total_charged_cents,
         gateway, gateway_ref, status, paid_at, tax_year, wants_18a, message)
       values ($1, $2, 18000, 0, 0, 0, 18000, 'test', $3, 'paid', now(), 2027, true, 'For my late father, Moshe Case') returning id`,
      [donor, ids.meals, ref],
    )
  ).rows[0].id as string;
  await run(
    `insert into public.donation_checkout_details (donation_id, donor_type, email, first_name, last_name, phone, id_number_encrypted, id_number_last4,
       address_line1, city, receipt_identity) values ($1, 'individual', 'erase-me@example.co.za', 'Erin', 'Case', '0821234567', 'v1.x.y.z', '1234', '1 Test Road', 'Johannesburg', 'fingerprint')`,
    [don],
  );
  await run("insert into public.donation_giving_kinds (donation_id, kind) values ($1, 'maaser')", [don]);
  await run("insert into public.donation_confirmations (donation_id, token_hash) values ($1, repeat('a', 64))", [don]);
  await run("insert into public.consents (kind, policy_version, donation_id) values ('donation', '2026-10', $1)", [don]);
  await run(
    `insert into public.recurring_donations (donor_id, charity_id, amount_cents, status, gateway, charge_day, authorization_encrypted, card_last4, message)
     values ($1, $2, 18000, 'active', 'test', 1, 'v1:token', '4081', 'monthly note')`,
    [donor, ids.meals],
  );
  await run(
    `insert into public.gateway_events (gateway, event_id, event_type, payload) values
       ('test', 'e1', 'payment_succeeded', jsonb_build_object('reference', $1::text, 'outcome', 'success', 'authorization', jsonb_build_object('code', 'AUTH_x'))),
       ('test', 'e2', 'other', jsonb_build_object('event', 'charge.success', 'data', jsonb_build_object('reference', $1::text, 'customer', jsonb_build_object('email', 'erase-me@example.co.za'))))`,
    [ref],
  );
  await run("insert into public.rate_limit_events (bucket, key) values ('checkout', 'email:erase-me@example.co.za'), ('checkout', 'email:someone-else@example.co.za')");
  // A receipt needs a fully set-up charity (mandate, s18A): try, and carry on without one if the charity isn't set up.
  await run("savepoint receipt");
  const receipt = await run(
    `select public.issue_s18a_receipt($1, $2, 2027, array[$3]::uuid[], 'EC', '{"donor":{"name":"Erin Case"}}'::jsonb, 'fingerprint')`,
    [ids.meals, donor, don],
  ).then(
    (r) => r.rows[0],
    async () => {
      await run("rollback to savepoint receipt");
      return null;
    },
  );
  return { donor, don, ref, receipt };
}

describe("erase_donor_data", () => {
  it("removes what identifies the person and keeps the records tax law requires", async () => {
    await tx(async () => {
      const w = await world();
      const r = (await run("select public.erase_donor_data(array[$1]::uuid[]) as r", [w.donor])).rows[0].r;
      expect(r).toMatchObject({ donors: 1, checkout_details: 1, monthly_stopped: 1, giving_choices: 1, messages: 1, gateway_records: 2 });

      const donor = (await run("select * from public.donors where id = $1", [w.donor])).rows[0];
      expect(donor).toMatchObject({ first_name: null, last_name: null, phone: null, id_number_encrypted: null, id_number_last4: null, address_line1: null });
      expect(donor.email).toBe(`erased+${w.donor}@erased.invalid`);
      expect(donor.erased_at).not.toBeNull();

      const d = (await run("select * from public.donation_checkout_details where donation_id = $1", [w.don])).rows[0];
      expect(d).toMatchObject({ first_name: null, last_name: null, phone: null, id_number_encrypted: null, address_line1: null, city: null, receipt_identity: null });
      expect(d.email).toMatch(/@erased\.invalid$/);

      // The donation itself, as the law requires, is untouched, except for the free text.
      const don = (await run("select amount_cents, status, tax_year, paid_at, message from public.donations where id = $1", [w.don])).rows[0];
      expect(don).toMatchObject({ amount_cents: "18000", status: "paid", tax_year: 2027, message: null });
      expect(don.paid_at).not.toBeNull();

      expect((await run("select 1 from public.donation_giving_kinds where donation_id = $1", [w.don])).rowCount).toBe(0);
      expect((await run("select 1 from public.donation_confirmations where donation_id = $1", [w.don])).rowCount).toBe(0);
    });
  });

  it("stops the monthly donation and destroys the stored card", async () => {
    await tx(async () => {
      const w = await world();
      await run("select public.erase_donor_data(array[$1]::uuid[])", [w.donor]);
      const m = (await run("select status, authorization_encrypted, card_last4, message, ended_reason from public.recurring_donations where donor_id = $1", [w.donor])).rows[0];
      expect(m).toMatchObject({ status: "cancelled", authorization_encrypted: null, card_last4: null, message: null });
    });
  });

  it("a monthly donation closed by a failed first payment is marked as erased, so it can never restart", async () => {
    await tx(async () => {
      const w = await world();
      await run("update public.recurring_donations set status = 'cancelled', ended_reason = 'the first payment failed' where donor_id = $1", [w.donor]);
      await run("select public.erase_donor_data(array[$1]::uuid[])", [w.donor]);
      const m = (await run("select ended_reason from public.recurring_donations where donor_id = $1", [w.donor])).rows[0];
      expect(m.ended_reason).toBe("the donor's information was erased");
    });
  });

  it("a charity's signed declarations survive the signer's account being deleted", async () => {
    await tx(async () => {
      await run("reset role");
      const u = (await run("insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'signer@example.co.za', 'authenticated', 'authenticated') returning id")).rows[0].id as string;
      await run("insert into public.consents (kind, policy_version, user_id, charity_id) values ('charity_declarations', '2026-10', $1, $2)", [u, ids.meals]);
      await run("delete from auth.users where id = $1", [u]);
      const left = await run("select user_id from public.consents where kind = 'charity_declarations' and charity_id = $1 and user_id is null", [ids.meals]);
      expect(left.rows.length).toBeGreaterThan(0);
    });
  });

  it("removes the customer from the gateway's raw records but keeps the reference", async () => {
    await tx(async () => {
      const w = await world();
      await run("select public.erase_donor_data(array[$1]::uuid[])", [w.donor]);
      const { rows } = await run("select payload from public.gateway_events where event_id in ('e1', 'e2') order by event_id");
      expect(rows[0].payload).toEqual({ event: null, reference: w.ref, redacted: true });
      expect(rows[1].payload).toEqual({ event: "charge.success", reference: w.ref, redacted: true });
      expect(JSON.stringify(rows)).not.toContain("erase-me@example.co.za");
    });
  });

  it("clears their address from the rate limiter and nobody else's", async () => {
    await tx(async () => {
      const w = await world();
      await run("select public.erase_donor_data(array[$1]::uuid[])", [w.donor]);
      const keys = (await run("select key from public.rate_limit_events where key like 'email:%@example.co.za'")).rows.map((r) => r.key);
      expect(keys).not.toContain("email:erase-me@example.co.za");
      expect(keys).toContain("email:someone-else@example.co.za");
    });
  });

  it("leaves other donors alone, and is safe to run again", async () => {
    await tx(async () => {
      const w = await world();
      await run("select public.erase_donor_data(array[$1]::uuid[])", [w.donor]);
      const again = (await run("select public.erase_donor_data(array[$1]::uuid[]) as r", [w.donor])).rows[0].r;
      expect(again.donors).toBe(1);
      const other = (await run("select first_name from public.donors where id = $1", [ids.donor])).rows[0];
      expect(other.first_name).not.toBeNull();
    });
  });

  it("an issued s18A receipt is kept as it was (the law requires it)", async () => {
    await tx(async () => {
      const w = await world();
      expect(w.receipt).not.toBeNull(); // the seeded charity can issue a receipt for this donation
      await run("select public.erase_donor_data(array[$1]::uuid[])", [w.donor]);
      const r = (await run("select status, details->'donor'->>'name' as name from public.s18a_receipts where donor_id = $1", [w.donor])).rows[0];
      expect(r).toMatchObject({ status: "issued", name: "Erin Case" });
    });
  });

  it("nothing to erase is not an error", async () => {
    const r = (await run("select public.erase_donor_data('{}') as r")).rows[0].r;
    expect(r).toEqual({ donors: 0 });
  });
});

describe("who may run it", () => {
  for (const role of ["anon", "authenticated"]) {
    it(`${role} cannot`, async () => {
      await run("begin");
      try {
        await run(`set local role ${role}`);
        await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ids.donorUser, role })]);
        await run("savepoint p");
        await expect(run("select public.erase_donor_data(array[$1]::uuid[])", [ids.donor])).rejects.toThrow(/permission denied/);
        await run("rollback to savepoint p");
      } finally {
        await run("rollback");
      }
    });
  }
});

describe("deleting the sign-in account", () => {
  it("is not blocked by the person's audit rows (their agreement records are removed first)", async () => {
    await tx(async () => {
      await run("reset role");
      const u = (
        await run(
          `insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'del-me@example.co.za', 'authenticated', 'authenticated') returning id`,
        )
      ).rows[0].id as string;
      await run("insert into public.audit_log (actor_user_id, action, entity_type) values ($1, 'privacy.request_delete', 'user')", [u]);
      await run("insert into public.consents (kind, policy_version, user_id) values ('account', '2026-10', $1)", [u]);
      await run("delete from public.consents where user_id = $1", [u]); // what eraseDonor does first
      await run("delete from auth.users where id = $1", [u]);
      const left = await run("select count(*)::int as n from public.audit_log where actor_user_id = $1", [u]);
      expect(left.rows[0].n).toBe(1); // the log keeps the bare id, never edited
      const gone = await run("select count(*)::int as n from auth.users where id = $1", [u]);
      expect(gone.rows[0].n).toBe(0);
    });
  });
});
