/**
 * Campaign journeys and the win-back journey (migration 20261110000011): each journey its own id and kind; one general
 * and one win-back journey per charity, one per campaign and only for the charity's own campaign; steps and enrolments
 * belong to a journey of their own charity; a donor once per journey but on several journeys; rows written the old
 * way (by charity only) land on the general journey; save_journey saves any journey in one go, server only; and the
 * tables stay server-only. Needs the local Supabase, seeded.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
let charity: string, other: string, admin: string;
beforeAll(async () => {
  await client.connect();
  charity = (await run("select id from public.charities where slug = $1", ["northcliff-meals-fund"])).rows[0].id;
  other = (await run("select id from public.charities where slug = $1", ["glenhazel-community-hall"])).rows[0].id;
  admin = (await run("select id from auth.users where email = $1", ["meals.admin@nedivlev.test"])).rows[0].id;
});
afterAll(() => client.end());

const tx = async (fn: () => Promise<void>) => {
  await run("begin");
  try {
    await fn();
  } finally {
    await run("rollback");
  }
};
async function refused(sql: string, args: unknown[], pattern: RegExp) {
  await run("savepoint s");
  await expect(run(sql, args)).rejects.toThrow(pattern);
  await run("rollback to savepoint s");
}
const as = async (user: string | null) => {
  await run(user ? "set local role authenticated" : "set local role anon");
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(user ? { sub: user, role: "authenticated", aal: "aal2", amr: [{ method: "otp" }] } : { role: "anon" })]);
};
const campaign = async (c: string, slug: string) =>
  (await run("insert into public.campaigns (charity_id, slug, title, status) values ($1, $2, 'Winter blankets', 'active') returning id", [c, slug])).rows[0].id as string;
const donor = async (email: string): Promise<string> => (await run("insert into public.donors (email, first_name) values ($1, 'Thandi') returning id", [email])).rows[0].id as string;
const save = "select public.save_journey($1, $2, $3, $4, $5, $6::jsonb, $7) as id";
const ONE = JSON.stringify([{ subject: "Welcome", body: "Thank you for your gift.", waitDays: 2 }]);

describe("the charity's journeys", () => {
  it("one general and one win-back journey per charity, one per campaign, and only the charity's own campaign", async () => {
    await tx(async () => {
      const mine = await campaign(charity, "kinds-mine");
      const theirs = await campaign(other, "kinds-theirs");
      await run("insert into public.charity_journeys (charity_id) values ($1)", [charity]);
      await refused("insert into public.charity_journeys (charity_id) values ($1)", [charity], /charity_journeys_one_general/);
      await run("insert into public.charity_journeys (charity_id, kind) values ($1, 'winback')", [charity]);
      await refused("insert into public.charity_journeys (charity_id, kind) values ($1, 'winback')", [charity], /charity_journeys_one_winback/);
      await run("insert into public.charity_journeys (charity_id, kind, campaign_id) values ($1, 'campaign', $2)", [charity, mine]);
      await refused("insert into public.charity_journeys (charity_id, kind, campaign_id) values ($1, 'campaign', $2)", [charity, mine], /charity_journeys_one_per_campaign/);
      await refused("insert into public.charity_journeys (charity_id, kind, campaign_id) values ($1, 'campaign', $2)", [charity, theirs], /charity_journey_own_campaign/);
      await refused("insert into public.charity_journeys (charity_id, kind) values ($1, 'campaign')", [charity], /charity_journey_campaign/);
      await refused("insert into public.charity_journeys (charity_id, kind, campaign_id) values ($1, 'winback', $2)", [other, theirs], /charity_journey_campaign/);
      await refused("insert into public.charity_journeys (charity_id, kind) values ($1, 'newsletter')", [charity], /charity_journey_kind/);
      // A campaign with a journey can't be deleted: its history is kept (the website ends it instead).
      await refused("delete from public.campaigns where id = $1", [mine], /charity_journey_own_campaign/);
      expect(Number((await run("select count(*) from public.charity_journeys where charity_id = $1 and kind = 'campaign'", [charity])).rows[0].count)).toBe(1);
    });
  });

  it("a row written the old way, by charity only, lands on the general journey", async () => {
    await tx(async () => {
      const general = (await run("insert into public.charity_journeys (charity_id) values ($1) returning id", [charity])).rows[0].id;
      await run("insert into public.charity_journeys (charity_id, kind) values ($1, 'winback')", [charity]);
      await run("insert into public.charity_journey_steps (charity_id, position, subject, body, wait_days) values ($1, 1, 'Welcome', 'Thank you for your gift.', 2)", [charity]);
      const d = await donor("kinds.old@example.com");
      const e = (await run("insert into public.charity_journey_enrolments (charity_id, donor_id, source, next_due_at) values ($1, $2, 'new_gift', now()) returning journey_id", [charity, d])).rows[0];
      expect(e.journey_id).toBe(general);
      expect((await run("select journey_id from public.charity_journey_steps where charity_id = $1", [charity])).rows).toEqual([{ journey_id: general }]);
      // The old save still saves the general journey, and only it.
      await run("select public.save_charity_journey($1, true, now(), $2::jsonb, $3)", [charity, ONE, admin]);
      expect((await run("select kind, enabled from public.charity_journeys where charity_id = $1 order by kind", [charity])).rows).toEqual([
        { kind: "general", enabled: true },
        { kind: "winback", enabled: false },
      ]);
    });
  });

  it("steps and enrolments belong to a journey of their own charity; a donor is once on each journey, and may be on several", async () => {
    await tx(async () => {
      const general = (await run("insert into public.charity_journeys (charity_id) values ($1) returning id", [charity])).rows[0].id;
      const winback = (await run("insert into public.charity_journeys (charity_id, kind) values ($1, 'winback') returning id", [charity])).rows[0].id;
      const theirs = (await run("insert into public.charity_journeys (charity_id, kind) values ($1, 'winback') returning id", [other])).rows[0].id;
      const d = await donor("kinds.both@example.com");
      const enrol = "insert into public.charity_journey_enrolments (charity_id, journey_id, donor_id, source, next_due_at) values ($1, $2, $3, $4, now())";
      await run(enrol, [charity, general, d, "new_gift"]);
      await run(enrol, [charity, winback, d, "winback"]);
      await refused(enrol, [charity, winback, d, "winback"], /journey_enrolment_once/);
      await refused(enrol, [charity, theirs, await donor("kinds.cross@example.com"), "winback"], /journey_other_charity/);
      await refused("insert into public.charity_journey_steps (charity_id, journey_id, position, subject, body, wait_days) values ($1, $2, 1, 'Welcome', 'Thank you for your gift.', 2)", [charity, theirs], /journey_other_charity/);
      // Leaving win-back because they gave again is a reason; a made-up one isn't.
      await run("update public.charity_journey_enrolments set status = 'stopped', stopped_reason = 'gave_again' where journey_id = $1", [winback]);
      await refused("update public.charity_journey_enrolments set status = 'stopped', stopped_reason = 'gave_up' where journey_id = $1", [general], /journey_enrolment_stopped_reason/);
      await refused(enrol, [charity, general, await donor("kinds.source@example.com"), "import"], /journey_enrolment_source/);
    });
  });

  it("save_journey saves any journey in one go, server only, and finds the same one again", async () => {
    await tx(async () => {
      const mine = await campaign(charity, "kinds-save");
      const theirs = await campaign(other, "kinds-save-theirs");
      const two = JSON.stringify([{ subject: "Welcome", body: "Thank you for your gift.", waitDays: 2 }, { subject: "More", body: "A little more about us.", waitDays: 21 }]);
      const a = (await run(save, [charity, "campaign", mine, true, new Date().toISOString(), two, admin])).rows[0].id;
      const b = (await run(save, [charity, "campaign", mine, true, new Date().toISOString(), ONE, admin])).rows[0].id;
      expect(b).toBe(a);
      expect(Number((await run("select count(*) from public.charity_journey_steps where journey_id = $1", [a])).rows[0].count)).toBe(1);
      const w = (await run(save, [charity, "winback", null, false, null, two, admin])).rows[0].id;
      expect(w).not.toBe(a);
      // No emails: it can't be on. A bad email leaves everything as it was.
      await run(save, [charity, "winback", null, true, new Date().toISOString(), "[]", admin]);
      expect((await run("select enabled from public.charity_journeys where id = $1", [w])).rows[0].enabled).toBe(false);
      await run(save, [charity, "winback", null, false, null, two, admin]);
      await refused(save, [charity, "winback", null, false, null, JSON.stringify([{ subject: "Bad", body: "Waits too long here.", waitDays: 31 }]), admin], /journey_step_wait/);
      expect(Number((await run("select count(*) from public.charity_journey_steps where journey_id = $1", [w])).rows[0].count)).toBe(2);
      await refused(save, [charity, "campaign", theirs, false, null, ONE, admin], /charity_journey_own_campaign/);
      await refused(save, [charity, "newsletter", null, false, null, ONE, admin], /journey_kind/);
      await refused(save, [charity, "winback", null, false, null, JSON.stringify(Array.from({ length: 6 }, () => ({ subject: "Hello", body: "Some words here.", waitDays: 7 }))), admin], /journey_too_many_steps/);
      for (const user of [admin, null]) {
        await as(user);
        await refused(save, [charity, "winback", null, false, null, ONE, admin], /permission denied/);
        await refused("select public.save_charity_journey($1, false, null, $2::jsonb, $3)", [charity, ONE, admin], /permission denied/);
        for (const t of ["charity_journeys", "charity_journey_steps", "charity_journey_enrolments", "charity_journey_sends"]) await refused(`select count(*) from public.${t}`, [], /permission denied/);
        await run("reset role");
      }
    });
  });

  it("stays server-only: row-level security on, no browser grants, and the helper functions closed", async () => {
    for (const t of ["charity_journeys", "charity_journey_steps", "charity_journey_enrolments", "charity_journey_sends"]) {
      expect((await run("select relrowsecurity from pg_class where oid = $1::regclass", [`public.${t}`])).rows[0].relrowsecurity).toBe(true);
      for (const r of ["anon", "authenticated"]) {
        expect((await run("select has_table_privilege($1, $2, 'select') as s, has_table_privilege($1, $2, 'insert') as i", [r, `public.${t}`])).rows[0]).toEqual({ s: false, i: false });
      }
    }
    for (const f of ["public.save_journey(uuid, text, uuid, boolean, timestamptz, jsonb, uuid)", "public.journey_row_default()", "public.journey_row_same_charity()"]) {
      for (const r of ["anon", "authenticated"]) expect((await run("select has_function_privilege($1, $2, 'execute') as x", [r, f])).rows[0].x).toBe(false);
    }
  });
});
