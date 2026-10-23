/**
 * A charity's own "what one gift pays for" figure (22/10/2026): anyone may read it, only the charity's own
 * admins may change it, and the three parts are set together or not at all. Needs the local Supabase, seeded.
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
    shulAdmin: await one("select id from auth.users where email = $1", ["shul.admin@nedivlev.test"]),
    meals: await one("select id from public.charities where slug = $1", ["northcliff-meals-fund"]),
  };
});
afterAll(() => client.end());

async function tx(fn: () => Promise<void>) {
  await run("begin");
  try { await fn(); } finally { await run("rollback"); }
}
async function as(who: "anon" | string) {
  await run("reset role");
  if (who === "anon") {
    await run("set local role anon");
    await run(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
  } else {
    await run("set local role authenticated");
    await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated", aal: "aal2" })]);
  }
}
async function refused(sql: string, args: unknown[], pattern: RegExp) {
  await run("savepoint p");
  await expect(run(sql, args)).rejects.toThrow(pattern);
  await run("rollback to savepoint p");
}
const SET = "update public.charities set impact_unit_cents = $2, impact_unit_one = $3, impact_unit_many = $4 where id = $1";

describe("a charity's own impact figure", () => {
  it("the charity's admin can set it, and a visitor can read it", () =>
    tx(async () => {
      await as(ids.mealsAdmin);
      const r = await run(SET + " returning id", [ids.meals, 1200, "school breakfast", "school breakfasts"]);
      expect(r.rowCount).toBe(1);
      await as("anon");
      const { rows } = await run("select impact_unit_cents, impact_unit_one, impact_unit_many from public.charities where id = $1", [ids.meals]);
      expect(rows[0]).toEqual({ impact_unit_cents: "1200", impact_unit_one: "school breakfast", impact_unit_many: "school breakfasts" });
    }));

  it("another charity's admin cannot change it", () =>
    tx(async () => {
      await as(ids.shulAdmin);
      const r = await run(SET + " returning id", [ids.meals, 100, "x", "y"]);
      expect(r.rowCount).toBe(0);
    }));

  it("a visitor cannot change it", () =>
    tx(async () => {
      await as("anon");
      await refused(SET, [ids.meals, 1200, "school breakfast", "school breakfasts"], /permission denied/);
    }));

  it("the three parts go together, and the cost stays between R1 and R100 000", () =>
    tx(async () => {
      await as(ids.mealsAdmin);
      await refused(SET, [ids.meals, 1200, "school breakfast", null], /impact_unit_all_or_none/);
      await refused(SET, [ids.meals, null, "school breakfast", "school breakfasts"], /impact_unit_all_or_none/);
      await refused(SET, [ids.meals, 50, "sticker", "stickers"], /impact_unit_cents/);
      await refused(SET, [ids.meals, 10_000_001, "house", "houses"], /impact_unit_cents/);
      await refused(SET, [ids.meals, 1200, "", "school breakfasts"], /impact_unit_one/);
      const cleared = await run(SET + " returning id", [ids.meals, null, null, null]);
      expect(cleared.rowCount).toBe(1);
    }));
});

describe("impact names and causes (second review)", () => {
  it("a unit name cannot start with a digit, even written straight to the database", async () => {
    await run("begin");
    try {
      await run("savepoint s");
      await expect(run("update public.charities set impact_unit_cents = 1200, impact_unit_one = '30 meals', impact_unit_many = 'meals' where id = $1", [ids.meals])).rejects.toThrow(/impact_unit_names_start_with_letter/);
      await run("rollback to savepoint s");
      await expect(run("update public.charities set impact_unit_cents = 1200, impact_unit_one = 'meal', impact_unit_many = 'meals' where id = $1", [ids.meals])).resolves.toBeTruthy();
    } finally {
      await run("rollback");
    }
  });
  it("a cause a charity has chosen cannot be deleted", async () => {
    await run("begin");
    try {
      await run("insert into public.categories (slug, name_en) values ('review-test-cause', 'Review test') ");
      const cat = (await run("select id from public.categories where slug = 'review-test-cause'")).rows[0].id;
      await run("insert into public.charity_categories (charity_id, category_id) values ($1, $2)", [ids.meals, cat]);
      await run("savepoint s");
      await expect(run("delete from public.categories where id = $1", [cat])).rejects.toThrow(/charity_categories_category_id_fkey/);
    } finally {
      await run("rollback");
    }
  });
});
