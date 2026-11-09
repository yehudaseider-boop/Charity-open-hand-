/**
 * Review fixes, database (09/11/2026): erasure keeps what SARS needs for issued s18A receipts, the receipt
 * locks its donations, the ciphertext check covers card authorisations, storage paths, a suspended charity's
 * rename, and the app's news opt-outs. Needs the local Supabase, seeded.
 */
import { createHash } from "node:crypto";
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
    mealsAdmin: await one("select id from auth.users where email = $1", ["meals.admin@nedivlev.test"]),
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
async function refused(sql: string, args: unknown[], pattern: RegExp) {
  await run("savepoint p");
  await expect(run(sql, args)).rejects.toThrow(pattern);
  await run("rollback to savepoint p");
}

/** A donor with two paid s18A gifts to Meals, each with full checkout details. */
async function twoGifts() {
  await run("reset role");
  const donor = (await run(
    `insert into public.donors (email, first_name, last_name) values ('sars-keep@example.co.za', 'Sam', 'Keep') returning id`,
  )).rows[0].id as string;
  const gifts: string[] = [];
  for (let i = 0; i < 2; i++) {
    const don = (await run(
      `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, contribution_cents, total_charged_cents,
         gateway, gateway_ref, status, paid_at, tax_year, wants_18a)
       values ($1, $2, 25000, 0, 0, 0, 25000, 'test', gen_random_uuid()::text, 'paid', now(), 2027, true) returning id`,
      [donor, ids.meals],
    )).rows[0].id as string;
    await run(
      `insert into public.donation_checkout_details (donation_id, donor_type, email, first_name, last_name, phone, id_number_encrypted, id_number_last4,
         tax_reference_encrypted, tax_reference_last4, registration_number, contact_person, address_line1, address_line2, suburb, city, postal_code, receipt_identity)
       values ($1, 'individual', 'sars-keep@example.co.za', 'Sam', 'Keep', '0821234567', 'v1.id', '9087', 'v1.tax', '9050', null, 'Pat',
               '1 Test Road', 'Flat 2', 'Parkhurst', 'Johannesburg', '2193', 'fp-keep')`,
      [don],
    );
    gifts.push(don);
  }
  return { donor, gifts };
}

describe("erasing a donor keeps what SARS needs for issued s18A receipts", () => {
  it("keeps names, numbers and address on a gift with an issued receipt, and erases a gift without one in full", async () => {
    await tx(async () => {
      const w = await twoGifts();
      await run(`select public.issue_s18a_receipt($1, $2, 2027, array[$3]::uuid[], 'SK', '{}'::jsonb, 'fp-keep')`, [ids.meals, w.donor, w.gifts[0]]);
      const r = (await run("select public.erase_donor_data(array[$1]::uuid[]) as r", [w.donor])).rows[0].r;
      expect(r).toMatchObject({ donors: 1, checkout_details: 2 });

      const row = async (id: string) => (await run("select * from public.donation_checkout_details where donation_id = $1", [id])).rows[0];
      const kept = await row(w.gifts[0]);
      expect(kept).toMatchObject({
        first_name: "Sam", last_name: "Keep", id_number_encrypted: "v1.id", tax_reference_encrypted: "v1.tax",
        address_line1: "1 Test Road", address_line2: "Flat 2", suburb: "Parkhurst", city: "Johannesburg", postal_code: "2193",
        phone: null, contact_person: null, id_number_last4: null, tax_reference_last4: null, receipt_identity: null,
      });
      expect(kept.email).toBe(`erased+${w.gifts[0]}@erased.invalid`);
      expect(kept.erased_at).not.toBeNull();

      const gone = await row(w.gifts[1]);
      expect(gone).toMatchObject({
        first_name: null, last_name: null, id_number_encrypted: null, tax_reference_encrypted: null,
        address_line1: null, city: null, postal_code: null, phone: null, receipt_identity: null,
      });
      expect(gone.erased_at).not.toBeNull();

      // The donor record itself keeps nothing.
      const donor = (await run("select first_name, last_name, id_number_encrypted, erased_at from public.donors where id = $1", [w.donor])).rows[0];
      expect(donor).toMatchObject({ first_name: null, last_name: null, id_number_encrypted: null });
    });
  });

  it("a void receipt keeps nothing", async () => {
    await tx(async () => {
      const w = await twoGifts();
      const rec = (await run(`select receipt_id from public.issue_s18a_receipt($1, $2, 2027, array[$3]::uuid[], 'SK', '{}'::jsonb, 'fp-keep')`, [ids.meals, w.donor, w.gifts[0]])).rows[0].receipt_id;
      await run("update public.s18a_receipts set status = 'void', voided_at = now(), void_reason = 'test' where id = $1", [rec]);
      await run("select public.erase_donor_data(array[$1]::uuid[])", [w.donor]);
      const d = (await run("select first_name, id_number_encrypted, address_line1 from public.donation_checkout_details where donation_id = $1", [w.gifts[0]])).rows[0];
      expect(d).toEqual({ first_name: null, id_number_encrypted: null, address_line1: null });
    });
  });
});

describe("issue_s18a_receipt", () => {
  it("locks the listed donations, in id order, before checking them", async () => {
    const src = (await run("select prosrc from pg_proc where proname = 'issue_s18a_receipt'")).rows[0].prosrc as string;
    const lock = src.indexOf("perform 1 from public.donations where id = any (p_donation_ids) order by id for update");
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(src.indexOf("d.status = 'paid'"));
  });

  it("still issues a receipt", async () => {
    await tx(async () => {
      const w = await twoGifts();
      const r = (await run(`select * from public.issue_s18a_receipt($1, $2, 2027, $3::uuid[], 'SK', '{}'::jsonb, 'fp-keep')`, [ids.meals, w.donor, w.gifts])).rows[0];
      expect(r.amount_cents).toBe("50000");
    });
  });
});

describe("ciphertext_hidden_from_browsers", () => {
  const check = async () => (await run("select public.ciphertext_hidden_from_browsers() as ok")).rows[0].ok as boolean;
  it("is true as migrated", async () => {
    expect(await check()).toBe(true);
  });
  for (const role of ["authenticated", "anon"]) {
    it(`turns false if ${role} could read the monthly card authorisation or the saved cards`, async () => {
      await tx(async () => {
        await run(`grant select (authorization_encrypted) on public.recurring_donations to ${role}`);
        expect(await check()).toBe(false);
      });
      await tx(async () => {
        await run(`grant select on public.saved_cards to ${role}`);
        expect(await check()).toBe(false);
      });
      await tx(async () => {
        await run(`grant select (id_number_encrypted) on public.donors to ${role}`);
        expect(await check()).toBe(false);
      });
    });
  }
  it("is for the server only", async () => {
    await tx(async () => {
      await as(ids.mealsAdmin);
      await refused("select public.ciphertext_hidden_from_browsers()", [], /permission denied/);
    });
  });
});

describe("fee_settings", () => {
  it("keeps the fixed gateway charge in bigint cents", async () => {
    const t = (await run("select data_type from information_schema.columns where table_schema = 'public' and table_name = 'fee_settings' and column_name = 'gateway_fixed_cents'")).rows[0];
    expect(t.data_type).toBe("bigint");
  });
});

describe("storage paths", () => {
  const put = (bucket: string, name: string) => run("insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, name]);

  it("public files only where the website puts them", async () => {
    await tx(async () => {
      await as(ids.mealsAdmin);
      const m = ids.meals;
      for (const name of [`${m}/logo-1.png`, `${m}/cover-2.jpg`, `${m}/photos/3.webp`, `${m}/updates/4.jpg`]) await put("charity-public", name);
      for (const name of [`${m}/other.png`, `${m}/secret/5.png`, `${m}/photos/a/6.png`, `${m}/photos/`, `${m}/updates/../logo.png`]) {
        await refused("insert into storage.objects (bucket_id, name) values ($1, $2)", ["charity-public", name], /row-level security/);
      }
    });
  });

  it("documents only while the application is a draft or sent back", async () => {
    await tx(async () => {
      const name = (n: number) => `${ids.meals}/npo_certificate-${n}.pdf`;
      await as(ids.mealsAdmin);
      await refused("insert into storage.objects (bucket_id, name) values ($1, $2)", ["charity-documents", name(1)], /row-level security/); // approved
      for (const [i, status] of (["draft", "rejected", "pending_review", "suspended"] as const).entries()) {
        await run("reset role");
        await run("update public.charities set status = $2 where id = $1", [ids.meals, status]);
        await as(ids.mealsAdmin);
        if (status === "draft" || status === "rejected") await put("charity-documents", name(i + 2));
        else await refused("insert into storage.objects (bucket_id, name) values ($1, $2)", ["charity-documents", name(i + 2)], /row-level security/);
      }
    });
  });
});

describe("a suspended charity renaming itself", () => {
  it("is written to the audit log", async () => {
    await tx(async () => {
      await run("reset role");
      await run("update public.charities set status = 'suspended' where id = $1", [ids.meals]);
      await as(ids.mealsAdmin);
      await run("update public.charities set name_en = 'Renamed While Suspended' where id = $1", [ids.meals]);
      await run("reset role");
      const rows = (await run("select details from public.audit_log where action = 'charity.public_name_changed' and entity_id = $1", [ids.meals])).rows;
      expect(rows.map((r) => r.details.name_to)).toContain("Renamed While Suspended");
    });
  });
});

describe("my_news_opt_outs", () => {
  const hash = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

  it("lists the charities the signed-in person said no news to, matched the way the opt-out was written", async () => {
    await tx(async () => {
      await run("reset role");
      await run("insert into public.charity_email_opt_outs (charity_id, email_hash, source) values ($1, $2, 'checkout')", [ids.meals, hash(" Donor@NedivLev.test ")]);
      await as(ids.donorUser);
      const rows = (await run("select * from public.my_news_opt_outs() as charity_id")).rows;
      expect(rows.map((r) => r.charity_id)).toEqual([ids.meals]);
      // Someone else sees nothing of theirs.
      await as(ids.mealsAdmin);
      expect((await run("select * from public.my_news_opt_outs()")).rows).toEqual([]);
      // A password session gets nothing, like my_donor_ids().
      await as(ids.donorUser, "password");
      expect((await run("select * from public.my_news_opt_outs()")).rows).toEqual([]);
    });
  });

  it("is not for visitors who are not signed in", async () => {
    await tx(async () => {
      await as("anon");
      await refused("select * from public.my_news_opt_outs()", [], /permission denied/);
    });
  });
});
