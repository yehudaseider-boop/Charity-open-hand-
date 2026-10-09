/**
 * Charity photos and updates: the charity's own admins add and remove them,
 * everyone reads them once the charity is approved, and nobody else can
 * touch them. Needs the local Supabase, seeded.
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
async function as(who: "anon" | string, aal = "aal2") {
  await run("reset role");
  if (who === "anon") {
    await run("set local role anon");
    await run(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
  } else {
    await run("set local role authenticated");
    await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated", aal })]);
  }
}
async function refused(sql: string, args: unknown[], pattern: RegExp) {
  await run("savepoint p");
  await expect(run(sql, args)).rejects.toThrow(pattern);
  await run("rollback to savepoint p");
}
const addUpdate = (body = "This month we delivered parcels.") =>
  run("insert into public.charity_updates (charity_id, body_en) values ($1, $2) returning id", [ids.meals, body]);
const addPhoto = (n = 0) =>
  run("insert into public.charity_photos (charity_id, storage_path) values ($1, $2) returning id", [ids.meals, `${ids.meals}/photos/p${n}.jpg`]);

describe("charity photos and updates", () => {
  it("the charity's admin posts; the public reads, without seeing who posted", async () => {
    await tx(async () => {
      await as(ids.mealsAdmin);
      await addUpdate();
      await addPhoto();
      await as("anon");
      const u = await run("select id, body_en from public.charity_updates where charity_id = $1", [ids.meals]);
      expect(u.rows).toHaveLength(1);
      expect((await run("select count(*)::int as n from public.charity_photos where charity_id = $1", [ids.meals])).rows[0].n).toBe(1);
      await refused("select posted_by from public.charity_updates", [], /permission denied/);
      await run("reset role");
      const who = await run("select posted_by from public.charity_updates where charity_id = $1", [ids.meals]);
      expect(who.rows[0].posted_by).toBe(ids.mealsAdmin);
    });
  });

  it("another charity, a donor, the public, or an admin without the second step cannot post or remove", async () => {
    await tx(async () => {
      for (const [who, aal] of [[ids.shulAdmin, "aal2"], [ids.donorUser, "aal1"], [ids.mealsAdmin, "aal1"]]) {
        await as(who, aal);
        await refused("insert into public.charity_updates (charity_id, body_en) values ($1, 'x')", [ids.meals], /row-level security/);
        await refused("insert into public.charity_photos (charity_id, storage_path) values ($1, $2)", [ids.meals, `${ids.meals}/photos/x.jpg`], /row-level security/);
      }
      await as("anon");
      await refused("insert into public.charity_updates (charity_id, body_en) values ($1, 'x')", [ids.meals], /permission denied/);

      await as(ids.mealsAdmin);
      const { rows } = await addUpdate();
      await as(ids.shulAdmin);
      await run("delete from public.charity_updates where id = $1", [rows[0].id]);
      await as(ids.mealsAdmin);
      expect((await run("select count(*)::int as n from public.charity_updates where id = $1", [rows[0].id])).rows[0].n).toBe(1);
      await run("delete from public.charity_updates where id = $1", [rows[0].id]);
      expect((await run("select count(*)::int as n from public.charity_updates where id = $1", [rows[0].id])).rows[0].n).toBe(0);
    });
  });

  it("nothing is edited in place, and posted_by can't be faked", async () => {
    await tx(async () => {
      await as(ids.mealsAdmin);
      const { rows } = await addUpdate();
      await refused("update public.charity_updates set body_en = 'changed' where id = $1", [rows[0].id], /permission denied/);
      await refused("insert into public.charity_updates (charity_id, body_en, posted_by) values ($1, 'x', $2)", [ids.meals, ids.shulAdmin], /permission denied/);
    });
  });

  it("files must sit in the charity's own folder, and text has limits", async () => {
    await tx(async () => {
      await as(ids.mealsAdmin);
      await refused("insert into public.charity_photos (charity_id, storage_path) values ($1, 'other/photos/a.jpg')", [ids.meals], /check constraint/);
      await refused("insert into public.charity_photos (charity_id, storage_path) values ($1, $2)", [ids.meals, `${ids.meals}/photos/../logo.jpg`], /check constraint/);
      await refused("insert into public.charity_updates (charity_id, body_en) values ($1, '   ')", [ids.meals], /check constraint/);
      await refused("insert into public.charity_updates (charity_id, body_en) values ($1, $2)", [ids.meals, "x".repeat(501)], /check constraint/);
      await refused("insert into public.charity_updates (charity_id, body_en, photo_path) values ($1, 'x', $2)", [ids.meals, `${ids.meals}/photos/a.jpg`], /check constraint/);
    });
  });

  it("up to 12 photos per charity", async () => {
    await tx(async () => {
      await as(ids.mealsAdmin);
      const existing = (await run("select count(*)::int as n from public.charity_photos where charity_id = $1", [ids.meals])).rows[0].n as number;
      for (let i = existing; i < 12; i++) await addPhoto(i);
      await refused("insert into public.charity_photos (charity_id, storage_path) values ($1, $2)", [ids.meals, `${ids.meals}/photos/extra.jpg`], /up to 12 photos/);
    });
  });

  it("a charity that isn't approved shows nothing to the public", async () => {
    await tx(async () => {
      await as(ids.mealsAdmin);
      await addUpdate();
      await run("reset role");
      await run("update public.charities set status = 'suspended' where id = $1", [ids.meals]);
      await as("anon");
      expect((await run("select count(*)::int as n from public.charity_updates where charity_id = $1", [ids.meals])).rows[0].n).toBe(0);
    });
  });
});

describe("saved charities (favourites)", () => {
  it("each person sees and changes only their own", async () => {
    await tx(async () => {
      await as(ids.donorUser, "aal1");
      await run("insert into public.favourites (user_id, charity_id) values ($1, $2)", [ids.donorUser, ids.meals]);
      expect((await run("select count(*)::int as n from public.favourites")).rows[0].n).toBe(1);
      await refused("insert into public.favourites (user_id, charity_id) values ($1, $2)", [ids.shulAdmin, ids.meals], /row-level security/);

      await as(ids.shulAdmin);
      expect((await run("select count(*)::int as n from public.favourites")).rows[0].n).toBe(0);
      await run("delete from public.favourites where user_id = $1", [ids.donorUser]);
      await as("anon");
      await refused("select * from public.favourites", [], /permission denied/);
      await as(ids.donorUser, "aal1");
      expect((await run("select count(*)::int as n from public.favourites")).rows[0].n).toBe(1);
    });
  });
});
