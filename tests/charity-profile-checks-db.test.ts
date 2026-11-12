/**
 * A charity's profile written straight through the database API (20261112100002_charity_profile_checks.sql, security
 * review 12/11/2026): the team can still save what the website accepts, but not a website that is not a web address
 * (such as a "javascript:" link) or texts longer than the forms allow. Needs the local Supabase, seeded.
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
async function as(who: "server" | string) {
  await run("reset role");
  if (who === "server") return;
  await run("set local role authenticated");
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated", aal: "aal2", amr: [{ method: "otp" }] })]);
}
async function refused(column: string, value: unknown, pattern: RegExp) {
  await run("savepoint p");
  await expect(run(`update public.charities set ${column} = $2 where id = $1`, [ids.meals, value])).rejects.toThrow(pattern);
  await run("rollback to savepoint p");
}
const save = (column: string, value: unknown) => run(`update public.charities set ${column} = $2 where id = $1 returning id`, [ids.meals, value]);

describe("a charity's profile written straight to the database", () => {
  it("are all validated on a seeded database (no existing charity breaks them)", async () => {
    const { rows } = await run(
      `select conname, convalidated from pg_constraint where conrelid = 'public.charities'::regclass
         and conname in ('charity_website_shape', 'charity_name_length', 'charity_legal_name_length', 'charity_description_length',
                         'charity_funds_use_length', 'charity_numbers_length', 'charity_address_length', 'charity_postal_code_shape')`,
    );
    expect(rows).toHaveLength(8);
    for (const r of rows) expect(r.convalidated, r.conname).toBe(true);
  });

  it("still takes what the website's forms take, from the charity's own team", async () => {
    await tx(async () => {
      await as(ids.mealsAdmin);
      for (const w of ["https://example.org.za", "http://example.org.za/about?x=1", "HTTPS://EXAMPLE.ORG.ZA", null]) {
        expect((await save("website", w)).rowCount).toBe(1);
      }
      expect((await save("name_en", "N".repeat(120))).rowCount).toBe(1);
      expect((await save("description_en", "d".repeat(3000))).rowCount).toBe(1);
      expect((await save("funds_use_en", "f".repeat(1500))).rowCount).toBe(1);
      // The address of a submitted or approved charity is locked to platform admins and the server (older rule,
      // 20261026000002), so these two are saved as the server: only the new length and shape checks apply.
      await as("server");
      expect((await save("postal_code", "2001")).rowCount).toBe(1);
      expect((await save("city", "c".repeat(80))).rowCount).toBe(1);
    });
  });

  it("refuses a website that isn't a web address, and over-long texts", async () => {
    await tx(async () => {
      await as(ids.mealsAdmin);
      for (const w of ["javascript:alert(1)", "data:text/html,hi", "example.org.za", "https://exa mple.org", "https://", `https://${"a".repeat(2000)}.org`]) {
        await refused("website", w, /charity_website_shape/);
      }
      await refused("name_en", "", /charity_name_length/);
      await refused("name_en", "N".repeat(121), /charity_name_length/);
      await refused("description_en", "d".repeat(3001), /charity_description_length/);
      // The same 1 500 limit was already on this column from the first "funds use" migration (09/10/2026), under
      // its automatic name, so that older check answers first. Either name means the text was refused.
      await refused("funds_use_en", "f".repeat(1501), /charity_funds_use_length|charities_funds_use_en_check/);
      // Legal details and the address of an approved charity are locked to platform admins and the server (older
      // rules), so the checks on those columns are tried as the server.
      await as("server");
      await refused("legal_name_en", "L".repeat(201), /charity_legal_name_length/);
      await refused("npo_number", "1".repeat(41), /charity_numbers_length/);
      await refused("address_line1", "a".repeat(201), /charity_address_length/);
      await refused("suburb", "s".repeat(81), /charity_address_length/);
      await refused("postal_code", "20011", /charity_postal_code_shape/);
      await refused("postal_code", "ab12", /charity_postal_code_shape/);
    });
  });

  it("hold for the server too (the same rules everywhere)", async () => {
    await tx(async () => {
      await as("server");
      await refused("website", "javascript:alert(1)", /charity_website_shape/);
    });
  });
});
