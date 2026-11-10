/**
 * A video on a charity update in the database (20261110000010_update_video.sql, CRM step 14): only a known site and
 * a well-formed video id can be stored, both or neither; the public reads it with the update of an approved charity;
 * the charity's page roles add it with the update; another charity's admin can't. Needs the local Supabase, seeded.
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
    hallAdmin: await one("select id from auth.users where email = $1", ["hall.admin@nedivlev.test"]),
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
async function as(who: "anon" | "server" | string) {
  await run("reset role");
  if (who === "server") return;
  if (who === "anon") {
    await run("set local role anon");
    await run(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
  } else {
    await run("set local role authenticated");
    await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated", aal: "aal2", amr: [{ method: "otp" }] })]);
  }
}
async function refused(sql: string, args: unknown[], pattern: RegExp) {
  await run("savepoint p");
  await expect(run(sql, args)).rejects.toThrow(pattern);
  await run("rollback to savepoint p");
}
const post = (provider: string | null, id: string | null) =>
  run(
    `insert into public.charity_updates (charity_id, body_en, video_provider, video_id) values ($1, 'We packed 40 parcels.', $2, $3) returning id`,
    [ids.meals, provider, id],
  );

describe("a video on a charity update", () => {
  it("keeps only a known site and a well-formed id, both or neither", async () => {
    await tx(async () => {
      await as("server");
      await post("youtube", "dQw4w9WgXcQ");
      await post("vimeo", "76979871");
      await post(null, null);
      await refused(`insert into public.charity_updates (charity_id, body_en, video_provider, video_id) values ($1, 'x', 'tiktok', '123')`, [ids.meals], /charity_update_video_provider/);
      await refused(`insert into public.charity_updates (charity_id, body_en, video_provider, video_id) values ($1, 'x', 'youtube', null)`, [ids.meals], /charity_update_video_all_or_none/);
      await refused(`insert into public.charity_updates (charity_id, body_en, video_provider, video_id) values ($1, 'x', null, 'dQw4w9WgXcQ')`, [ids.meals], /charity_update_video_all_or_none/);
      for (const [p, id] of [["youtube", "https://youtu.be/dQw4w9WgXcQ"], ["youtube", "<iframe>"], ["youtube", "short"], ["vimeo", "0123"], ["vimeo", "abc"]]) {
        await refused(`insert into public.charity_updates (charity_id, body_en, video_provider, video_id) values ($1, 'x', $2, $3)`, [ids.meals, p, id], /charity_update_video_id_shape/);
      }
    });
  });

  it("is added with the update by the charity's own team, and not by another charity's admin", async () => {
    await tx(async () => {
      await as(ids.mealsAdmin);
      const mine = await run(
        `insert into public.charity_updates (charity_id, body_en, video_provider, video_id, posted_by) values ($1, 'Our kitchen this week.', 'youtube', 'dQw4w9WgXcQ', $2) returning id`,
        [ids.meals, ids.mealsAdmin],
      );
      expect(mine.rowCount).toBe(1);
      await as(ids.hallAdmin);
      await refused(
        `insert into public.charity_updates (charity_id, body_en, video_provider, video_id, posted_by) values ($1, 'Not mine.', 'youtube', 'dQw4w9WgXcQ', $2)`,
        [ids.meals, ids.hallAdmin],
        /row-level security/,
      );
    });
  });

  it("is read by the public with the update of an approved charity", async () => {
    await tx(async () => {
      await as("server");
      const { rows } = await post("vimeo", "76979871");
      await as("anon");
      const seen = await run("select video_provider, video_id from public.charity_updates where id = $1", [rows[0].id]);
      expect(seen.rows).toEqual([{ video_provider: "vimeo", video_id: "76979871" }]);
      // Who posted stays private, as before.
      await refused("select posted_by from public.charity_updates where id = $1", [rows[0].id], /permission denied/);
    });
  });
});
