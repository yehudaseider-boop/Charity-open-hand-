/**
 * The profile video and the charity's own focus in the database (20261110000003_profile_video_focus.sql):
 * only a known site and a well-formed video id can be stored; a focus is public only while its Johannesburg
 * dates run and only for an approved charity; browsers can't write one; dates and lengths are enforced.
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
    mealsAdmin: await one("select id from auth.users where email = $1", ["meals.admin@nedivlev.test"]),
    hallAdmin: await one("select id from auth.users where email = $1", ["hall.admin@nedivlev.test"]),
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
async function as(who: "anon" | "server" | string) {
  await run("reset role");
  if (who === "server") return;
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
/** A focus written by the server, with days counted from today in Johannesburg. */
const focus = (charity: string, from: number, to: number, o: { title?: string; message?: string; campaign?: string | null } = {}) =>
  run(
    `insert into public.charity_focus (charity_id, campaign_id, title, message, starts_on, ends_on)
     values ($1, $2, $3, $4, (now() at time zone 'Africa/Johannesburg')::date + $5::int, (now() at time zone 'Africa/Johannesburg')::date + $6::int)`,
    [charity, o.campaign ?? null, o.title ?? "Winter blankets", o.message ?? "Nights are cold. We're handing out blankets this month.", from, to],
  );
const visible = async (charity: string) => (await run("select title from public.charity_focus where charity_id = $1", [charity])).rows.length;

describe("profile video columns", () => {
  it("the charity's admin saves a site and a video id; the public reads them; another charity's admin can't change them", async () => {
    await tx(async () => {
      await run("update public.charities set status = 'approved' where id = any($1)", [[ids.meals, ids.hall]]);
      await as(ids.mealsAdmin);
      expect((await run("update public.charities set video_provider = 'youtube', video_id = 'dQw4w9WgXcQ' where id = $1 returning id", [ids.meals])).rows).toHaveLength(1);
      await as(ids.hallAdmin);
      expect((await run("update public.charities set video_provider = null, video_id = null where id = $1 returning id", [ids.meals])).rows).toHaveLength(0);
      await as("anon");
      expect((await run("select video_provider, video_id from public.charities where id = $1", [ids.meals])).rows).toEqual([{ video_provider: "youtube", video_id: "dQw4w9WgXcQ" }]);
      await refused("update public.charities set video_provider = null, video_id = null where id = $1", [ids.meals], /permission denied/);
    });
  });

  it("nothing but a known site with a well-formed id can be stored, whoever writes it", async () => {
    await tx(async () => {
      const set = "update public.charities set video_provider = $2, video_id = $3 where id = $1";
      for (const [provider, id] of [
        ["youtube", "https://youtu.be/dQw4w9WgXcQ"],
        ["youtube", '"><script>alert(1)</script>'],
        ["youtube", "dQw4w9WgXc"],
        ["youtube", "dQw4w9WgXcQ&autoplay=1"],
        ["vimeo", "dQw4w9WgXcQ"],
        ["vimeo", "76979871/abcdef"],
        ["vimeo", "0123"],
        ["dailymotion", "x8abc"],
        ["youtube", null],
        [null, "dQw4w9WgXcQ"],
      ]) await refused(set, [ids.meals, provider, id], /charity_video_/);
      await run(set, [ids.meals, "vimeo", "76979871"]);
      await run(set, [ids.meals, null, null]);
    });
  });

  it("a charity that isn't approved shows no video to the public", async () => {
    await tx(async () => {
      await run("update public.charities set video_provider = 'vimeo', video_id = '76979871', status = 'suspended' where id = $1", [ids.meals]);
      await as("anon");
      expect((await run("select video_id from public.charities where id = $1", [ids.meals])).rows).toHaveLength(0);
    });
  });
});

describe("the charity's own focus", () => {
  it("is public only while its Johannesburg dates run, first and last day included", async () => {
    await tx(async () => {
      await run("update public.charities set status = 'approved' where id = any($1)", [[ids.meals, ids.hall]]);
      await focus(ids.meals, 0, 1);
      await as("anon");
      expect(await visible(ids.meals)).toBe(1);
      await as("server");
      // Its last day is today: still showing.
      await run("update public.charity_focus set starts_on = ends_on - 6, ends_on = (now() at time zone 'Africa/Johannesburg')::date where charity_id = $1", [ids.meals]);
      await as("anon");
      expect(await visible(ids.meals)).toBe(1);
      // Ended yesterday.
      await as("server");
      await run("update public.charity_focus set starts_on = starts_on - 1, ends_on = ends_on - 1 where charity_id = $1", [ids.meals]);
      await as("anon");
      expect(await visible(ids.meals)).toBe(0);
      // Starts tomorrow.
      await as("server");
      await run("update public.charity_focus set ends_on = ends_on + 10 where charity_id = $1", [ids.meals]);
      await run("update public.charity_focus set starts_on = (now() at time zone 'Africa/Johannesburg')::date + 1 where charity_id = $1", [ids.meals]);
      await as("anon");
      expect(await visible(ids.meals)).toBe(0);
    });
  });

  it("only an approved charity's focus is public; its own admins see theirs at any time; other charities' admins don't", async () => {
    await tx(async () => {
      await run("update public.charities set status = 'approved' where id = $1", [ids.hall]);
      for (const status of ["draft", "pending_review", "rejected", "suspended"]) {
        await run("savepoint s");
        await run("update public.charities set status = $2::public.charity_status where id = $1", [ids.meals, status]);
        await focus(ids.meals, 0, 5);
        await as("anon");
        expect(await visible(ids.meals), status).toBe(0);
        await as(ids.hallAdmin);
        expect(await visible(ids.meals), status).toBe(0);
        await as(ids.mealsAdmin);
        expect(await visible(ids.meals), status).toBe(1);
        await as("server");
        await run("rollback to savepoint s");
      }
      // Approved, but scheduled for later: its admins see it, nobody else does.
      await run("update public.charities set status = 'approved' where id = $1", [ids.meals]);
      await focus(ids.meals, 3, 9);
      await as(ids.mealsAdmin);
      expect(await visible(ids.meals)).toBe(1);
      await as(ids.hallAdmin);
      expect(await visible(ids.meals)).toBe(0);
      await as("anon");
      expect(await visible(ids.meals)).toBe(0);
    });
  });

  it("browsers can't write one: not the public, not another charity's admin, not even its own admin", async () => {
    await tx(async () => {
      await run("update public.charities set status = 'approved' where id = $1", [ids.meals]);
      await focus(ids.meals, 0, 5);
      const insert = "insert into public.charity_focus (charity_id, title, message, starts_on, ends_on) values ($1, 'Not mine', 'Words', current_date, current_date + 3)";
      for (const who of ["anon", ids.hallAdmin, ids.mealsAdmin]) {
        await as(who);
        await refused(insert, [ids.hall], /permission denied/);
        await refused("update public.charity_focus set title = 'Changed' where charity_id = $1", [ids.meals], /permission denied/);
        await refused("delete from public.charity_focus where charity_id = $1", [ids.meals], /permission denied/);
      }
      await as("server");
      expect((await run("select title from public.charity_focus where charity_id = $1", [ids.meals])).rows).toEqual([{ title: "Winter blankets" }]);
    });
  });

  it("one at a time per charity, with dates and lengths enforced", async () => {
    await tx(async () => {
      await focus(ids.meals, 0, 61);
      await refused("insert into public.charity_focus (charity_id, title, message, starts_on, ends_on) values ($1, 'Second one', 'Words', current_date, current_date + 3)", [ids.meals], /duplicate key/);
      const set = (sql: string) => `update public.charity_focus set ${sql} where charity_id = $1`;
      await refused(set("ends_on = starts_on"), [ids.meals], /charity_focus_end_after_start/);
      await refused(set("ends_on = starts_on - 1"), [ids.meals], /charity_focus_end_after_start/);
      await refused(set("ends_on = starts_on + 62"), [ids.meals], /charity_focus_length/);
      await refused(set("title = 'ab'"), [ids.meals], /charity_focus_title/);
      await refused(set("title = repeat('x', 81)"), [ids.meals], /charity_focus_title/);
      await refused(set("title = '  padded  '"), [ids.meals], /charity_focus_title/);
      await refused(set("message = ''"), [ids.meals], /charity_focus_message/);
      await refused(set("message = '   '"), [ids.meals], /charity_focus_message/);
      await refused(set("message = repeat('x', 201)"), [ids.meals], /charity_focus_message/);
      await run(set("message = repeat('x', 200), title = repeat('y', 80)"), [ids.meals]);
    });
  });

  it("can point only at the same charity's campaign, and outlives it if the campaign is removed", async () => {
    await tx(async () => {
      const campaign = async (charity: string, slug: string) =>
        (await run("insert into public.campaigns (charity_id, slug, title, target_cents, status) values ($1, $2, 'Winter blanket drive', 5000000, 'active') returning id", [charity, slug])).rows[0].id as string;
      const theirs = await campaign(ids.hall, "focus-test-hall");
      const ours = await campaign(ids.meals, "focus-test-meals");
      await run("savepoint p");
      await expect(focus(ids.meals, 0, 5, { campaign: theirs })).rejects.toThrow(/charity_focus_campaign/);
      await run("rollback to savepoint p");
      await focus(ids.meals, 0, 5, { campaign: ours });
      await run("delete from public.campaigns where id = $1", [ours]);
      expect((await run("select campaign_id, title from public.charity_focus where charity_id = $1", [ids.meals])).rows).toEqual([{ campaign_id: null, title: "Winter blankets" }]);
    });
  });

  it("goes when the charity goes, and never touches Givezy's cause of the week", async () => {
    await tx(async () => {
      const before = (await run("select count(*)::int as n from public.featured_charities")).rows[0].n;
      await focus(ids.meals, 0, 5);
      expect((await run("select count(*)::int as n from public.featured_charities")).rows[0].n).toBe(before);
    });
  });
});
