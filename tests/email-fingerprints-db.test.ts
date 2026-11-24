/**
 * Keyed email fingerprints, database half (24/11/2026, migration 20261124000001): every table keeps the version,
 * convert_email_fingerprints() turns plain hashes into keyed ones (merging a row whose keyed twin is already there,
 * keeping the stronger choice), user_email_addresses() replaces my_news_opt_outs() and is for the server only.
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
