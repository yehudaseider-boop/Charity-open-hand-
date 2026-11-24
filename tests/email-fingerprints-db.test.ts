/**
 * Keyed email fingerprints, database half (24/11/2026, migration 20261124000001): every table keeps the version,
 * convert_email_fingerprints() turns plain hashes into keyed ones (merging a row whose keyed twin is already there,
 * keeping the stronger choice), claim_thank_you_recipient() never claims an address whose plain twin is claimed,
 * user_email_addresses() replaces my_news_opt_outs() and is for the server only.
 * Needs the local Supabase, seeded.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
let ids: Record<string, string>;

beforeAll(async () => {
  await client.connect();
  const one = async (sql: string, a: unknown[]) => (await run(sql, a)).rows[0].id as string;
  ids = {
    donorUser: await one("select id from auth.users where email = $1", ["donor@nedivlev.test"]),
    meals: await one("select id from public.charities where slug = $1", ["northcliff-meals-fund"]),
    hall: await one("select id from public.charities where slug = $1", ["glenhazel-community-hall"]),
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
async function as(who: "anon" | string) {
  await run("reset role");
  if (who === "anon") {
    await run("set local role anon");
    await run(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
  } else {
    await run("set local role authenticated");
    await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated", aal: "aal2", amr: [{ method: "otp", timestamp: 0 }] })]);
  }
}
async function refused(sql: string, args: unknown[], pattern: RegExp) {
  await run("savepoint p");
  await expect(run(sql, args)).rejects.toThrow(pattern);
  await run("rollback to savepoint p");
}

const OLD = "a".repeat(64);
const NEW = "b".repeat(64);
const convert = (table: string) => run("select public.convert_email_fingerprints($1, $2, $3) as n", [table, [OLD], [NEW]]);

describe("convert_email_fingerprints", () => {
  it("marks rows written without a version as plain hashes (version 1)", async () => {
    await tx(async () => {
      await run("insert into public.thank_you_opt_outs (email_hash) values ($1)", [OLD]);
      expect((await run("select email_hash_v from public.thank_you_opt_outs where email_hash = $1", [OLD])).rows).toEqual([{ email_hash_v: 1 }]);
    });
  });

  it("keys a row at version 1, and does nothing the second time", async () => {
    await tx(async () => {
      await run("insert into public.charity_email_opt_outs (charity_id, email_hash, source) values ($1, $2, 'checkout')", [ids.meals, OLD]);
      expect((await convert("charity_email_opt_outs")).rows[0].n).toBe(1);
      expect((await convert("charity_email_opt_outs")).rows[0].n).toBe(0);
      expect((await run("select email_hash, email_hash_v from public.charity_email_opt_outs where charity_id = $1 and email_hash in ($2, $3)", [ids.meals, OLD, NEW])).rows).toEqual([{ email_hash: NEW, email_hash_v: 2 }]);
    });
  });

  it("merges with a keyed twin and keeps the stronger choice", async () => {
    await tx(async () => {
      // A stop link before the change (plain), then the checkout tick after it (keyed).
      await run("insert into public.charity_email_opt_outs (charity_id, email_hash, email_hash_v, source) values ($1, $2, 1, 'stop_link'), ($1, $3, 2, 'checkout')", [ids.meals, OLD, NEW]);
      await convert("charity_email_opt_outs");
      expect((await run("select email_hash, source from public.charity_email_opt_outs where charity_id = $1 and email_hash in ($2, $3)", [ids.meals, OLD, NEW])).rows).toEqual([{ email_hash: NEW, source: "stop_link" }]);
    });
  });

  it("never changes a row already keyed", async () => {
    await tx(async () => {
      await run("insert into public.thank_you_opt_outs (email_hash, email_hash_v) values ($1, 2)", [OLD]);
      expect((await convert("thank_you_opt_outs")).rows[0].n).toBe(0);
      expect((await run("select email_hash_v from public.thank_you_opt_outs where email_hash = $1", [OLD])).rows).toEqual([{ email_hash_v: 2 }]);
    });
  });

  it("merges thank-you claims: the outcome that may have reached them wins, with its own date; the earlier date only on a tie", async () => {
    await tx(async () => {
      const month = async (m: string) => (await run("insert into public.charity_thank_yous (charity_id, period_month, body) values ($1, $2, 'Thank you all.') returning id", [ids.meals, m])).rows[0].id as string;
      const [a, b, c] = [await month("2026-07-01"), await month("2026-08-01"), await month("2026-09-01")];
      const claim = (t: string, hash: string, v: number, status: string, at: string) =>
        run("insert into public.charity_thank_you_recipients (thank_you_id, email_hash, email_hash_v, status, claimed_at) values ($1, $2, $3, $4, $5)", [t, hash, v, status, at]);
      // a: sent this week before the change (plain), a failed try earlier (keyed): sent wins and keeps this week's date.
      await claim(a, OLD, 1, "sent", "2026-11-23T10:00:00Z");
      await claim(a, NEW, 2, "failed", "2026-11-01T10:00:00Z");
      // b: failed earlier (plain), sent this week (keyed): sent stays, with its own date.
      await claim(b, OLD, 1, "failed", "2026-11-01T10:00:00Z");
      await claim(b, NEW, 2, "sent", "2026-11-23T10:00:00Z");
      // c: both sent: the earlier date.
      await claim(c, OLD, 1, "sent", "2026-11-02T10:00:00Z");
      await claim(c, NEW, 2, "sent", "2026-11-20T10:00:00Z");
      await convert("charity_thank_you_recipients");
      const rows = (await run("select thank_you_id, email_hash, email_hash_v, status, claimed_at from public.charity_thank_you_recipients where thank_you_id = any($1)", [[a, b, c]])).rows;
      const by = Object.fromEntries(rows.map((r) => [r.thank_you_id, { hash: r.email_hash, v: r.email_hash_v, status: r.status, at: (r.claimed_at as Date).toISOString() }]));
      expect(rows).toHaveLength(3);
      expect(by[a]).toEqual({ hash: NEW, v: 2, status: "sent", at: "2026-11-23T10:00:00.000Z" });
      expect(by[b]).toEqual({ hash: NEW, v: 2, status: "sent", at: "2026-11-23T10:00:00.000Z" });
      expect(by[c]).toEqual({ hash: NEW, v: 2, status: "sent", at: "2026-11-02T10:00:00.000Z" });
    });
  });

  it("a checkout tick before the change and a stop link after it: the stop link stays, with the earlier date", async () => {
    await tx(async () => {
      await run(
        "insert into public.charity_email_opt_outs (charity_id, email_hash, email_hash_v, source, created_at) values ($1, $2, 1, 'checkout', '2026-10-01T10:00:00Z'), ($1, $3, 2, 'stop_link', '2026-11-24T10:00:00Z')",
        [ids.meals, OLD, NEW],
      );
      await convert("charity_email_opt_outs");
      const rows = (await run("select email_hash, email_hash_v, source, created_at from public.charity_email_opt_outs where charity_id = $1 and email_hash in ($2, $3)", [ids.meals, OLD, NEW])).rows;
      expect(rows.map((r) => ({ ...r, created_at: (r.created_at as Date).toISOString() }))).toEqual([{ email_hash: NEW, email_hash_v: 2, source: "stop_link", created_at: "2026-10-01T10:00:00.000Z" }]);
    });
  });

  it("the same address at two charities: merged where the keyed twin is, converted (never dropped) where it isn't", async () => {
    await tx(async () => {
      await run(
        "insert into public.charity_email_opt_outs (charity_id, email_hash, email_hash_v, source) values ($1, $3, 1, 'stop_link'), ($1, $4, 2, 'checkout'), ($2, $3, 1, 'checkout')",
        [ids.meals, ids.hall, OLD, NEW],
      );
      expect((await convert("charity_email_opt_outs")).rows[0].n).toBe(2);
      const rows = (await run("select charity_id, email_hash, email_hash_v, source from public.charity_email_opt_outs where email_hash in ($1, $2) order by source desc", [OLD, NEW])).rows;
      expect(rows).toEqual([
        { charity_id: ids.meals, email_hash: NEW, email_hash_v: 2, source: "stop_link" },
        { charity_id: ids.hall, email_hash: NEW, email_hash_v: 2, source: "checkout" },
      ]);
    });
  });

  it("a stop from every charity made both before and after the change: one keyed row, with the earlier date", async () => {
    await tx(async () => {
      await run("insert into public.thank_you_opt_outs (email_hash, email_hash_v, created_at) values ($1, 1, '2026-10-01T10:00:00Z'), ($2, 2, '2026-11-24T10:00:00Z')", [OLD, NEW]);
      await convert("thank_you_opt_outs");
      const rows = (await run("select email_hash, email_hash_v, created_at from public.thank_you_opt_outs where email_hash in ($1, $2)", [OLD, NEW])).rows;
      expect(rows.map((r) => ({ ...r, created_at: (r.created_at as Date).toISOString() }))).toEqual([{ email_hash: NEW, email_hash_v: 2, created_at: "2026-10-01T10:00:00.000Z" }]);
    });
  });

  it("refuses other tables and is not for browsers", async () => {
    await tx(async () => {
      await refused("select public.convert_email_fingerprints('donors', $1, $2)", [[OLD], [NEW]], /Not a table/);
      await as(ids.donorUser);
      await refused("select public.convert_email_fingerprints('thank_you_opt_outs', $1, $2)", [[OLD], [NEW]], /permission denied/);
      await as("anon");
      await refused("select public.convert_email_fingerprints('thank_you_opt_outs', $1, $2)", [[OLD], [NEW]], /permission denied/);
    });
  });
});

describe("claim_thank_you_recipient", () => {
  const claim = (t: string, keyed = NEW, plain = OLD) => run("select public.claim_thank_you_recipient($1, $2, $3) as ok", [t, keyed, plain]);
  const month = async (m: string) => (await run("insert into public.charity_thank_yous (charity_id, period_month, body) values ($1, $2, 'Thank you all.') returning id", [ids.meals, m])).rows[0].id as string;

  it("claims the keyed value once, and never when the plain twin is already claimed for that thank-you", async () => {
    await tx(async () => {
      const [a, b] = [await month("2026-07-01"), await month("2026-08-01")];
      expect((await claim(a)).rows[0].ok).toBe(true);
      expect((await claim(a)).rows[0].ok).toBe(false);
      expect((await run("select email_hash, email_hash_v, status from public.charity_thank_you_recipients where thank_you_id = $1", [a])).rows).toEqual([{ email_hash: NEW, email_hash_v: 2, status: "sending" }]);
      // b: claimed before the change, at the plain hash: the keyed claim is refused and nothing is added.
      await run("insert into public.charity_thank_you_recipients (thank_you_id, email_hash, email_hash_v, status) values ($1, $2, 1, 'sent')", [b, OLD]);
      expect((await claim(b)).rows[0].ok).toBe(false);
      expect((await run("select email_hash from public.charity_thank_you_recipients where thank_you_id = $1", [b])).rows).toEqual([{ email_hash: OLD }]);
    });
  });

  it("refuses anything but a pair of fingerprints, and is not for browsers", async () => {
    await tx(async () => {
      const t = await month("2026-07-01");
      await refused("select public.claim_thank_you_recipient($1, $2, $3)", [t, NEW, NEW], /Not a fingerprint pair/);
      await refused("select public.claim_thank_you_recipient($1, $2, $3)", [t, "x", OLD], /Not a fingerprint pair/);
      await as(ids.donorUser);
      await refused("select public.claim_thank_you_recipient($1, $2, $3)", [t, NEW, OLD], /permission denied/);
      await as("anon");
      await refused("select public.claim_thank_you_recipient($1, $2, $3)", [t, NEW, OLD], /permission denied/);
    });
  });
});

describe("user_email_addresses", () => {
  it("lists the person's own addresses, trimmed and in lower case", async () => {
    await tx(async () => {
      await run(
        "insert into public.donors (user_id, email, donor_type, first_name, last_name) values ($1, ' Work.Address@NedivLev.test ', 'individual', 'Test', 'Donor')",
        [ids.donorUser],
      );
      const rows = (await run("select * from public.user_email_addresses($1) as e", [ids.donorUser])).rows.map((r) => r.e);
      expect(rows).toContain("donor@nedivlev.test");
      expect(rows).toContain("work.address@nedivlev.test");
    });
  });

  it("includes an address typed at their checkout, and leaves out erased details", async () => {
    await tx(async () => {
      const donor = async (email: string, erased: boolean) =>
        (await run(
          `insert into public.donors (user_id, email, donor_type, first_name, last_name, erased_at) values ($1, $2, 'individual', 'Test', 'Donor', ${erased ? "now()" : "null"}) returning id`,
          [ids.donorUser, email],
        )).rows[0].id as string;
      const gift = async (donorId: string, email: string, erased: boolean) => {
        const g = (await run(
          `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, total_charged_cents, gateway, gateway_ref, status, paid_at, tax_year)
           values ($1, $2, 10000, 0, 0, 10000, 'test', gen_random_uuid()::text, 'paid', '2026-09-15T08:00:00Z', 2027) returning id`,
          [donorId, ids.meals],
        )).rows[0].id as string;
        await run(
          `insert into public.donation_checkout_details (donation_id, donor_type, email, first_name, last_name, phone, erased_at) values ($1, 'individual', $2, 'Test', 'Donor', '0821234567', ${erased ? "now()" : "null"})`,
          [g, email],
        );
      };
      const kept = await donor("kept.record@nedivlev.test", false);
      await gift(kept, " Typed.At.Checkout@NedivLev.test", false);
      await gift(kept, "erased.checkout@nedivlev.test", true);
      await donor("erased.record@nedivlev.test", true);
      const rows = (await run("select * from public.user_email_addresses($1) as e", [ids.donorUser])).rows.map((r) => r.e);
      expect(rows).toContain("typed.at.checkout@nedivlev.test");
      expect(rows).toContain("kept.record@nedivlev.test");
      expect(rows).not.toContain("erased.checkout@nedivlev.test");
      expect(rows).not.toContain("erased.record@nedivlev.test");
      // Nobody else's addresses: an unknown person has none.
      expect((await run("select * from public.user_email_addresses(gen_random_uuid()) as e")).rows).toEqual([]);
    });
  });

  it("is for the server only, and my_news_opt_outs() is gone", async () => {
    await tx(async () => {
      await as(ids.donorUser);
      await refused("select * from public.user_email_addresses($1)", [ids.donorUser], /permission denied/);
      await as("anon");
      await refused("select * from public.user_email_addresses($1)", [ids.donorUser], /permission denied/);
      await run("reset role");
      await refused("select * from public.my_news_opt_outs()", [], /does not exist/);
    });
  });
});
