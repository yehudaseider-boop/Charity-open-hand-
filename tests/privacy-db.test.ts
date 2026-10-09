/**
 * Privacy lanes: what each kind of person can and cannot read, checked the
 * way the API would see them (database role + signed-in claims).
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
    mealsAdmin: await one("select id from auth.users where email = $1", ["meals.admin@nedivlev.test"]),
    shulAdmin: await one("select id from auth.users where email = $1", ["shul.admin@nedivlev.test"]),
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
async function as(who: "anon" | string, method = "otp") {
  await run("reset role");
  if (who === "anon") {
    await run("set local role anon");
    await run(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
  } else {
    await run("set local role authenticated");
    await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated", aal: "aal2", amr: [{ method, timestamp: 0 }] })]);
  }
}
/** Expect a statement to be refused outright, without breaking the transaction. */
async function denied(sql: string, args: unknown[] = []) {
  await run("savepoint p");
  await expect(run(sql, args)).rejects.toThrow(/permission denied/);
  await run("rollback to savepoint p");
}
/** A paid donation from the seeded donor to Meals, with typed details and a recurring row. */
async function paidDonation() {
  await run("reset role");
  const { rows } = await run(
    `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, contribution_cents,
       total_charged_cents, gateway, gateway_ref, status, paid_at, tax_year, wants_18a)
     values ($1, $2, 18000, 0, 0, 2000, 20000, 'test', gen_random_uuid()::text, 'paid', now(), 2027, true) returning id`,
    [ids.donor, ids.meals],
  );
  const id = rows[0].id as string;
  await run(
    `insert into public.donation_checkout_details (donation_id, donor_type, email, first_name, id_number_last4, receipt_identity)
     values ($1, 'individual', 'donor@nedivlev.test', 'Dina', '9087', 'fingerprint')`,
    [id],
  );
  await run("insert into public.donation_giving_kinds (donation_id, kind) values ($1, 'maaser')", [id]);
  await run(
    `insert into public.recurring_donations (donor_id, charity_id, amount_cents, gateway, gateway_subscription_ref, gateway_customer_ref)
     values ($1, $2, 18000, 'test', 'SUB_secret', 'CUS_secret')`,
    [ids.donor, ids.meals],
  );
  return id;
}

describe("the public (not signed in)", () => {
  it("sees charity profiles, but never gateway or mandate details", async () => {
    await tx(async () => {
      await as("anon");
      expect((await run("select name_en, is_s18a from public.charities where id = $1", [ids.meals])).rowCount).toBe(1);
      await denied("select gateway_subaccount_ref from public.charities");
      await denied("select mandate_document_path from public.charities");
      await denied("select rejection_reason from public.charities");
      await denied("select * from public.charities");
    });
  });

  it("can't read any donation, donor, receipt or server table", async () => {
    await tx(async () => {
      await as("anon");
      for (const t of ["donations", "donors", "donation_checkout_details", "donation_giving_kinds", "s18a_receipts", "recurring_donations", "charity_private", "charity_donations", "gateway_events", "receipt_counters", "rate_limit_events", "audit_log", "profiles"]) {
        await denied(`select 1 from public.${t} limit 1`);
      }
    });
  });
});

describe("a donor", () => {
  it("sees their own donations, giving kind and monthly donations, but not the checkout details table", async () => {
    await tx(async () => {
      const id = await paidDonation();
      await as(ids.donorUser);
      expect((await run("select id from public.donations where id = $1", [id])).rowCount).toBe(1);
      expect((await run("select kind from public.donation_giving_kinds where donation_id = $1", [id])).rows[0].kind).toBe("maaser");
      expect((await run("select id from public.recurring_donations where donor_id = $1", [ids.donor])).rowCount).toBeGreaterThan(0);
      // What was typed at checkout (ID number, fingerprint) stays with the server.
      expect((await run("select * from public.donation_checkout_details where donation_id = $1", [id])).rowCount).toBe(0);
      // And nothing of charities' private side.
      expect((await run("select * from public.charity_donations")).rowCount).toBe(0);
      expect((await run("select * from public.charity_private")).rowCount).toBe(0);
    });
  });

  it("can't truncate or write money tables", async () => {
    await tx(async () => {
      await as(ids.donorUser);
      await denied("truncate public.donations");
      await denied("update public.donations set amount_cents = 1");
      await denied("insert into public.s18a_receipts (charity_id, receipt_number, donor_id, tax_year, amount_cents, details) values ($1, 1, $2, 2027, 1, '{}')", [ids.meals, ids.donor]);
    });
  });
});

describe("a charity admin", () => {
  it("sees who gave to their charity, without fees, contribution, giving kind, ID or tax numbers", async () => {
    await tx(async () => {
      const id = await paidDonation();
      await as(ids.mealsAdmin);
      const rows = (await run("select * from public.charity_donations where id = $1", [id])).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ first_name: "Dina", amount_cents: "18000" });
      for (const hidden of ["contribution_cents", "total_charged_cents", "platform_fee_cents", "gateway", "gateway_ref", "kind", "id_number_last4", "tax_reference_last4", "id_number_encrypted", "receipt_identity"]) {
        expect(Object.keys(rows[0])).not.toContain(hidden);
      }
      // The raw tables stay closed.
      expect((await run("select * from public.donations where id = $1", [id])).rowCount).toBe(0);
      expect((await run("select * from public.donation_checkout_details where donation_id = $1", [id])).rowCount).toBe(0);
      expect((await run("select * from public.donation_giving_kinds where donation_id = $1", [id])).rowCount).toBe(0);
      expect((await run("select * from public.recurring_donations where charity_id = $1", [ids.meals])).rowCount).toBe(0);
      expect((await run("select * from public.donors")).rowCount).toBe(0);
      // Not even their own charity's gateway reference.
      await denied("select gateway_subaccount_ref from public.charities where id = $1", [ids.meals]);
    });
  });

  it("sees nothing of another charity", async () => {
    await tx(async () => {
      const id = await paidDonation();
      await as(ids.shulAdmin);
      expect((await run("select * from public.charity_donations where id = $1", [id])).rowCount).toBe(0);
      expect((await run("select * from public.charity_private where charity_id = $1", [ids.meals])).rowCount).toBe(0);
      expect((await run("select * from public.charity_documents where charity_id = $1", [ids.meals])).rowCount).toBe(0);
      expect((await run("select * from public.s18a_receipts where charity_id = $1", [ids.meals])).rowCount).toBe(0);
      await run("savepoint p");
      await expect(run("select * from public.charity_donor_list($1)", [ids.meals])).rejects.toThrow(/Not allowed/);
      await run("rollback to savepoint p");
    });
  });
});

describe("leftovers are gone", () => {
  it("has no helper that lets a charity probe whether someone gave to it", async () => {
    const { rowCount } = await run("select 1 from pg_proc where proname = 'donor_gave_to_my_charity'");
    expect(rowCount).toBe(0);
  });
});

describe("charity documents", () => {
  it("can only point at files in the charity's own folder", async () => {
    await tx(async () => {
      await run("reset role");
      const other = "00000000-0000-0000-0000-000000000001";
      await run("savepoint p");
      await expect(
        run("insert into public.charity_documents (charity_id, document_type, storage_path, file_name) values ($1, 'npo_certificate', $2, 'x.pdf')", [ids.meals, `${other}/bank.pdf`]),
      ).rejects.toThrow(/charity_documents_own_folder/);
      await run("rollback to savepoint p");
      await run("savepoint q");
      await expect(
        run("insert into public.charity_documents (charity_id, document_type, storage_path, file_name) values ($1, 'npo_certificate', $2, 'x.pdf')", [ids.meals, `${ids.meals}/../${other}/bank.pdf`]),
      ).rejects.toThrow(/charity_documents_own_folder/);
      await run("rollback to savepoint q");
      await run("insert into public.charity_documents (charity_id, document_type, storage_path, file_name) values ($1, 'npo_certificate', $2, 'x.pdf')", [ids.meals, `${ids.meals}/npo.pdf`]);
    });
  });
});

describe("agreements and privacy requests", () => {
  it("each person reads only their own, and nobody can write or forge them directly", async () => {
    await tx(async () => {
      await run("reset role");
      await run("insert into public.consents (kind, policy_version, user_id) values ('account', 'v-test', $1), ('account', 'v-test', $2)", [ids.donorUser, ids.mealsAdmin]);
      await run("insert into public.data_requests (user_id, kind, details) values ($1, 'delete', 'please'), ($2, 'correct', 'typo')", [ids.donorUser, ids.mealsAdmin]);

      await as(ids.donorUser);
      expect((await run("select user_id from public.consents where policy_version = 'v-test'")).rows.map((r) => r.user_id)).toEqual([ids.donorUser]);
      expect((await run("select user_id from public.data_requests")).rows.map((r) => r.user_id)).toEqual([ids.donorUser]);
      await denied("insert into public.consents (kind, policy_version, user_id) values ('account', 'forged', $1)", [ids.donorUser]);
      await denied("update public.data_requests set status = 'done'");
      await denied("delete from public.consents");

      await as("anon");
      await denied("select 1 from public.consents");
      await denied("select 1 from public.data_requests");
    });
  });

  it("refuses an agreement record that doesn't say who or what it is for", async () => {
    await tx(async () => {
      await run("reset role");
      await run("savepoint p");
      await expect(run("insert into public.consents (kind, policy_version) values ('account', 'v')")).rejects.toThrow(/consent_has_subject/);
      await run("rollback to savepoint p");
    });
  });
});

describe("signing in from the app", () => {
  async function newUser(email: string, confirmed: boolean) {
    await run("reset role");
    const { rows } = await run(
      "insert into auth.users (id, email, email_confirmed_at) values (gen_random_uuid(), $1, $2) returning id",
      [email, confirmed ? new Date().toISOString() : null],
    );
    return rows[0].id as string;
  }
  async function guestDonor(email: string) {
    await run("reset role");
    const { rows } = await run(
      "insert into public.donors (email, donor_type, age_confirmed_18_at, popia_consent_at) values ($1, 'individual', now(), now()) returning id",
      [email],
    );
    return rows[0].id as string;
  }

  it("joins donations given with a confirmed email to that account, and nobody else's", async () => {
    await tx(async () => {
      const mine = await guestDonor("Gila@Example.co.za");
      const other = await guestDonor("someone.else@example.co.za");
      const u = await newUser("gila@example.co.za", true);
      // Signed in with a password (e.g. someone who signed up with this address): nothing joins.
      await as(u, "password");
      expect((await run("select public.link_my_donations() as n")).rows[0].n).toBe(0);
      // Signed in with the emailed code: proof they read that inbox.
      await as(u);
      expect((await run("select public.link_my_donations() as n")).rows[0].n).toBe(1);
      await run("reset role");
      const owners = (await run("select id, user_id from public.donors where id = any($1)", [[mine, other]])).rows;
      expect(owners.find((r) => r.id === mine)?.user_id).toBe(u);
      expect(owners.find((r) => r.id === other)?.user_id).toBeNull();
    });
  });

  it("does nothing for an unconfirmed email, and never takes a donor record an account already has", async () => {
    await tx(async () => {
      await guestDonor("pending@example.co.za");
      const unconfirmed = await newUser("pending@example.co.za", false);
      await as(unconfirmed);
      expect((await run("select public.link_my_donations() as n")).rows[0].n).toBe(0);

      // A donor record already claimed by one account stays with it.
      const claimed = await guestDonor("claimed@example.co.za");
      const first = await newUser("claimed@example.co.za", true);
      await as(first);
      expect((await run("select public.link_my_donations() as n")).rows[0].n).toBe(1);
      await run("reset role");
      await run("update auth.users set email = 'second-' || email where id = $1", [first]);
      const second = await newUser("claimed@example.co.za", true);
      await as(second);
      expect((await run("select public.link_my_donations() as n")).rows[0].n).toBe(0);
      await run("reset role");
      expect((await run("select user_id from public.donors where id = $1", [claimed])).rows[0].user_id).toBe(first);
    });
  });

  it("records the app's agreement for the signed-in person only, and not for visitors", async () => {
    await tx(async () => {
      await as(ids.donorUser);
      await run("select public.agree_to_policy('2026-10-08-draft')");
      expect((await run("select count(*)::int as n from public.consents where user_id = $1 and policy_version = '2026-10-08-draft'", [ids.donorUser])).rows[0].n).toBeGreaterThan(0);
      await run("savepoint p");
      await expect(run("select public.agree_to_policy('<script>')")).rejects.toThrow(/Unknown policy version/);
      await run("rollback to savepoint p");
      await as("anon");
      await denied("select public.agree_to_policy('2026-10-08-draft')");
      await denied("select public.link_my_donations()");
    });
  });
});

describe("giving made elsewhere", () => {
  it("is private to the person who logged it, and needs a valid choice and amount", async () => {
    await tx(async () => {
      await as(ids.donorUser);
      await run("insert into public.external_giving_entries (user_id, amount_cents, entry_date, recipient_text, kind) values ($1, 72000, '2026-06-10', 'Shul appeal (cash)', 'maaser')", [ids.donorUser]);
      expect((await run("select kind from public.external_giving_entries")).rows.map((r) => r.kind)).toEqual(["maaser"]);

      await as(ids.mealsAdmin);
      expect((await run("select 1 from public.external_giving_entries")).rowCount).toBe(0);
      await run("savepoint p");
      await expect(run("insert into public.external_giving_entries (user_id, amount_cents, entry_date, recipient_text, kind) values ($1, 100, '2026-06-10', 'Forged', 'maaser')", [ids.donorUser])).rejects.toThrow(/row-level security/);
      await run("rollback to savepoint p");

      await as(ids.donorUser);
      for (const [cents, kind, who] of [[0, "maaser", "x"], [-5, "maaser", "x"], [100, "other", "x"], [100, "maaser", ""]] as const) {
        await run("savepoint q");
        await expect(run("insert into public.external_giving_entries (user_id, amount_cents, entry_date, recipient_text, kind) values ($1, $2, '2026-06-10', $3, $4)", [ids.donorUser, cents, who, kind])).rejects.toThrow();
        await run("rollback to savepoint q");
      }
    });
  });
});

describe("pausing and cancelling a monthly donation", () => {
  async function monthly() {
    await run("reset role");
    const { rows } = await run("insert into public.recurring_donations (donor_id, charity_id, amount_cents) values ($1, $2, 50000) returning id", [ids.donor, ids.meals]);
    return rows[0].id as string;
  }
  const state = async (id: string) => {
    await run("reset role");
    return (await run("select status, needs_gateway_sync, paused_at is not null as paused, cancelled_at is not null as cancelled from public.recurring_donations where id = $1", [id])).rows[0];
  };

  it("lets the donor pause, resume and cancel, and flags each change for the payment provider", async () => {
    await tx(async () => {
      const id = await monthly();
      expect(await state(id)).toMatchObject({ status: "active", needs_gateway_sync: false });
      await as(ids.donorUser);
      await run("select public.set_my_recurring_status($1, 'paused')", [id]);
      expect(await state(id)).toMatchObject({ status: "paused", paused: true, needs_gateway_sync: true });
      await as(ids.donorUser);
      await run("select public.set_my_recurring_status($1, 'active')", [id]);
      expect(await state(id)).toMatchObject({ status: "active", paused: false });
      await as(ids.donorUser);
      await run("select public.set_my_recurring_status($1, 'cancelled')", [id]);
      expect(await state(id)).toMatchObject({ status: "cancelled", cancelled: true });
      // A cancelled monthly donation can't be brought back.
      await as(ids.donorUser);
      await run("savepoint p");
      await expect(run("select public.set_my_recurring_status($1, 'active')", [id])).rejects.toThrow(/cannot be set/);
      await run("rollback to savepoint p");
    });
  });

  it("refuses anyone else, visitors, direct edits and made-up statuses", async () => {
    await tx(async () => {
      const id = await monthly();
      await as(ids.mealsAdmin);
      await run("savepoint a");
      await expect(run("select public.set_my_recurring_status($1, 'cancelled')", [id])).rejects.toThrow(/not found/);
      await run("rollback to savepoint a");
      await as(ids.donorUser);
      await run("savepoint b");
      await expect(run("select public.set_my_recurring_status($1, 'failed')", [id])).rejects.toThrow(/Unknown status/);
      await run("rollback to savepoint b");
      await denied("update public.recurring_donations set status = 'cancelled' where id = $1", [id]);
      await as("anon");
      await denied("select public.set_my_recurring_status($1, 'cancelled')", [id]);
      expect((await state(id)).status).toBe("active");
    });
  });
});
