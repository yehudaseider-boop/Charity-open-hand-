/**
 * The donor journey (migration 20261110000007): four server-only tables (no browser reads or writes them, with or
 * without a second step or a password), at most five emails with waits in range, a donor on a charity's journey once,
 * each email logged once, a journey email shares the donor's one-a-week claim, and everything goes with the charity
 * (enrolments with the donor). Needs the local Supabase, seeded.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
let charity: string, admin: string, otherAdmin: string;
beforeAll(async () => {
  await client.connect();
  charity = (await run("select id from public.charities where slug = $1", ["northcliff-meals-fund"])).rows[0].id;
  admin = (await run("select id from auth.users where email = $1", ["meals.admin@nedivlev.test"])).rows[0].id;
  otherAdmin = (await run("select id from auth.users where email = $1", ["hall.admin@nedivlev.test"])).rows[0].id;
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
const as = async (user: string | null, aal = "aal2", method = "otp") => {
  await run(user ? "set local role authenticated" : "set local role anon");
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(user ? { sub: user, role: "authenticated", aal, amr: [{ method }] } : { role: "anon" })]);
};
async function refused(sql: string, args: unknown[], pattern: RegExp) {
  await run("savepoint s");
  await expect(run(sql, args)).rejects.toThrow(pattern);
  await run("rollback to savepoint s");
}
const donor = async (email = "journey.test@example.com"): Promise<string> => (await run("insert into public.donors (email, first_name) values ($1, 'Thandi') returning id", [email])).rows[0].id as string;
const journey = async () => {
  await run("insert into public.charity_journeys (charity_id, enabled, switched_on_at) values ($1, true, now())", [charity]);
  await run("insert into public.charity_journey_steps (charity_id, position, subject, body, wait_days) values ($1, 1, 'Welcome', 'Thank you for your gift.', 2)", [charity]);
};
const enrol = async (donorId: string, over: Record<string, unknown> = {}) => {
  const row = { charity_id: charity, donor_id: donorId, source: "new_gift", next_step: 1, next_due_at: new Date().toISOString(), ...over };
  const keys = Object.keys(row);
  return (await run(`insert into public.charity_journey_enrolments (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`, Object.values(row))).rows[0].id as string;
};
const TABLES = ["charity_journeys", "charity_journey_steps", "charity_journey_enrolments", "charity_journey_sends"];

describe("the donor journey's tables", () => {
  it("all four have row-level security on", async () => {
    for (const t of TABLES) {
      expect((await run("select relrowsecurity from pg_class where oid = $1::regclass", [`public.${t}`])).rows[0].relrowsecurity).toBe(true);
    }
  });

  it("no browser session reads or writes them: not the charity's own admin, another charity's, a password session or a visitor", async () => {
    await tx(async () => {
      await journey();
      const d = await donor();
      const e = await enrol(d);
      await run("insert into public.charity_journey_sends (enrolment_id, charity_id, position) values ($1, $2, 1)", [e, charity]);
      for (const [user, aal, method] of [[admin, "aal2", "otp"], [admin, "aal1", "otp"], [admin, "aal2", "password"], [otherAdmin, "aal2", "otp"], [null, "", ""]] as const) {
        await as(user, aal, method);
        for (const t of TABLES) await refused(`select count(*) from public.${t}`, [], /permission denied/);
        await refused("update public.charity_journeys set enabled = false where charity_id = $1", [charity], /permission denied/);
        await refused("insert into public.charity_journey_steps (charity_id, position, subject, body, wait_days) values ($1, 2, 'Hello', 'Some words here.', 7)", [charity], /permission denied/);
        await refused("delete from public.charity_journey_enrolments where id = $1", [e], /permission denied/);
        await refused("insert into public.charity_journey_sends (enrolment_id, charity_id, position) values ($1, $2, 2)", [e, charity], /permission denied/);
        await run("reset role");
      }
    });
  });

  it("a switched-on journey says since when", async () => {
    await tx(async () => {
      await refused("insert into public.charity_journeys (charity_id, enabled) values ($1, true)", [charity], /charity_journey_on_since/);
      await run("insert into public.charity_journeys (charity_id, enabled) values ($1, false)", [charity]);
    });
  });

  it("at most five emails, a subject and words of sensible length, and waits in range", async () => {
    await tx(async () => {
      await run("insert into public.charity_journeys (charity_id) values ($1)", [charity]);
      const add = "insert into public.charity_journey_steps (charity_id, position, subject, body, wait_days) values ($1, $2, $3, $4, $5)";
      await refused(add, [charity, 0, "Welcome", "Thank you for your gift.", 2], /journey_step_position/);
      await refused(add, [charity, 6, "Welcome", "Thank you for your gift.", 7], /journey_step_position/);
      await refused(add, [charity, 1, "Hi", "Thank you for your gift.", 2], /journey_step_subject/);
      await refused(add, [charity, 1, " Welcome", "Thank you for your gift.", 2], /journey_step_subject/);
      await refused(add, [charity, 1, "Two\nlines", "Thank you for your gift.", 2], /journey_step_subject/);
      await refused(add, [charity, 1, "x".repeat(121), "Thank you for your gift.", 2], /journey_step_subject/);
      await refused(add, [charity, 1, "Welcome", "Too short", 2], /journey_step_body/);
      await refused(add, [charity, 1, "Welcome", "x".repeat(1501), 2], /journey_step_body/);
      await refused(add, [charity, 1, "Welcome", "Thank you for your gift.", 31], /journey_step_wait/);
      await refused(add, [charity, 1, "Welcome", "Thank you for your gift.", -1], /journey_step_wait/);
      await refused(add, [charity, 2, "Welcome", "Thank you for your gift.", 6], /journey_step_wait/);
      await refused(add, [charity, 2, "Welcome", "Thank you for your gift.", 181], /journey_step_wait/);
      await run(add, [charity, 1, "Welcome", "Thank you for your gift.", 0]);
      await run(add, [charity, 2, "A little more", "x".repeat(1500), 180]);
      await refused(add, [charity, 2, "Again", "Thank you for your gift.", 7], /duplicate/);
    });
  });

  it("a donor is on a charity's journey once; stopping needs a reason and only a stop has one", async () => {
    await tx(async () => {
      await journey();
      const d = await donor();
      await enrol(d);
      await refused("insert into public.charity_journey_enrolments (charity_id, donor_id, source, next_due_at) values ($1, $2, 'existing', now())", [charity, d], /journey_enrolment_once/);
      const d2 = await donor("journey.two@example.com");
      await refused("insert into public.charity_journey_enrolments (charity_id, donor_id, source, next_due_at) values ($1, $2, 'import', now())", [charity, d2], /journey_enrolment_source/);
      await refused("insert into public.charity_journey_enrolments (charity_id, donor_id, source, next_due_at, next_step) values ($1, $2, 'existing', now(), 7)", [charity, d2], /journey_enrolment_step/);
      await refused("insert into public.charity_journey_enrolments (charity_id, donor_id, source, next_due_at, status) values ($1, $2, 'existing', now(), 'stopped')", [charity, d2], /journey_enrolment_reason/);
      await refused("insert into public.charity_journey_enrolments (charity_id, donor_id, source, next_due_at, stopped_reason) values ($1, $2, 'existing', now(), 'opted_out')", [charity, d2], /journey_enrolment_reason/);
      await refused("insert into public.charity_journey_enrolments (charity_id, donor_id, source, next_due_at, status, stopped_reason) values ($1, $2, 'existing', now(), 'stopped', 'bored')", [charity, d2], /journey_enrolment_stopped_reason/);
      await run("insert into public.charity_journey_enrolments (charity_id, donor_id, source, next_due_at, status, stopped_reason) values ($1, $2, 'existing', now(), 'stopped', 'opted_out')", [charity, d2]);
    });
  });

  it("each email is logged once per donor: 'sending' first, then 'sent' with when, or 'unknown'", async () => {
    await tx(async () => {
      await journey();
      const e = await enrol(await donor());
      const id = (await run("insert into public.charity_journey_sends (enrolment_id, charity_id, position) values ($1, $2, 1) returning id, status, sent_at", [e, charity])).rows[0];
      expect(id).toMatchObject({ status: "sending", sent_at: null });
      await refused("insert into public.charity_journey_sends (enrolment_id, charity_id, position) values ($1, $2, 1)", [e, charity], /journey_send_once/);
      await refused("insert into public.charity_journey_sends (enrolment_id, charity_id, position) values ($1, $2, 6)", [e, charity], /journey_send_position/);
      await refused("update public.charity_journey_sends set status = 'sent' where id = $1", [id.id], /journey_send_sent_at/);
      await refused("update public.charity_journey_sends set sent_at = now() where id = $1", [id.id], /journey_send_sent_at/);
      await refused("update public.charity_journey_sends set status = 'bounced' where id = $1", [id.id], /journey_send_status/);
      await run("update public.charity_journey_sends set status = 'sent', sent_at = now() where id = $1", [id.id]);
      await run("update public.charity_journey_sends set status = 'unknown', sent_at = null where id = $1", [id.id]);
    });
  });

  it("tries are counted, and a donor whose emails can't be delivered is stopped with that reason", async () => {
    await tx(async () => {
      await journey();
      const e = await enrol(await donor());
      await run("update public.charity_journey_enrolments set attempts = 3 where id = $1", [e]);
      await refused("update public.charity_journey_enrolments set attempts = -1 where id = $1", [e], /journey_enrolment_attempts/);
      await refused("update public.charity_journey_enrolments set attempts = 11 where id = $1", [e], /journey_enrolment_attempts/);
      await run("update public.charity_journey_enrolments set status = 'stopped', stopped_reason = 'not_delivered' where id = $1", [e]);
    });
  });

  it("the journey is saved in one go, server only: the switch and exactly the emails given", async () => {
    await tx(async () => {
      const save = "select public.save_charity_journey($1, $2, $3, $4::jsonb, $5)";
      const two = JSON.stringify([{ subject: "Welcome", body: "Thank you for your gift.", waitDays: 2 }, { subject: "More", body: "A little more about us.", waitDays: 21 }]);
      await run(save, [charity, true, new Date().toISOString(), two, admin]);
      expect((await run("select enabled, updated_by from public.charity_journeys where charity_id = $1", [charity])).rows[0]).toEqual({ enabled: true, updated_by: admin });
      expect((await run("select position, subject, wait_days from public.charity_journey_steps where charity_id = $1 order by position", [charity])).rows).toEqual([
        { position: 1, subject: "Welcome", wait_days: 2 },
        { position: 2, subject: "More", wait_days: 21 },
      ]);
      // Fewer emails: the rest go. No emails: it can't be on.
      await run(save, [charity, true, new Date().toISOString(), JSON.stringify([{ subject: "Only one", body: "Thank you for your gift.", waitDays: 0 }]), admin]);
      expect(Number((await run("select count(*) from public.charity_journey_steps where charity_id = $1", [charity])).rows[0].count)).toBe(1);
      await run(save, [charity, true, new Date().toISOString(), "[]", admin]);
      expect((await run("select enabled from public.charity_journeys where charity_id = $1", [charity])).rows[0].enabled).toBe(false);
      // A bad email leaves everything as it was: the save is one transaction.
      await run(save, [charity, false, null, two, admin]);
      await refused(save, [charity, true, new Date().toISOString(), JSON.stringify([{ subject: "Welcome", body: "Thank you for your gift.", waitDays: 2 }, { subject: "Bad", body: "Waits too little.", waitDays: 1 }]), admin], /journey_step_wait/);
      expect(Number((await run("select count(*) from public.charity_journey_steps where charity_id = $1", [charity])).rows[0].count)).toBe(2);
      await refused(save, [charity, false, null, JSON.stringify(Array.from({ length: 6 }, () => ({ subject: "Hello", body: "Some words here.", waitDays: 7 }))), admin], /journey_too_many_steps/);
      for (const [user, aal] of [[admin, "aal2"], [null, ""]] as const) {
        await as(user, aal);
        await refused(save, [charity, false, null, two, admin], /permission denied/);
        await refused("select * from public.remove_journey_enrolments($1, $2::uuid[])", [charity, []], /permission denied/);
        await run("reset role");
      }
    });
  });

  it("taking back added donors removes only those with no email logged, and says how many stayed", async () => {
    await tx(async () => {
      await journey();
      const a = await enrol(await donor("journey.a@example.com"), { source: "existing" });
      const b = await enrol(await donor("journey.b@example.com"), { source: "existing" });
      const c = await enrol(await donor("journey.c@example.com"), { source: "existing" });
      await run("insert into public.charity_journey_sends (enrolment_id, charity_id, position) values ($1, $2, 1)", [b, charity]);
      const other = (await run("select id from public.charities where slug = $1", ["glenhazel-community-hall"])).rows[0].id;
      // Another charity's ids are never touched.
      expect((await run("select removed, stayed from public.remove_journey_enrolments($1, $2::uuid[])", [other, [a, b, c]])).rows[0]).toEqual({ removed: 0, stayed: 0 });
      expect((await run("select removed, stayed from public.remove_journey_enrolments($1, $2::uuid[])", [charity, [a, b, c]])).rows[0]).toEqual({ removed: 2, stayed: 1 });
      expect((await run("select id from public.charity_journey_enrolments where id = any($1::uuid[])", [[a, b, c]])).rows.map((r) => r.id)).toEqual([b]);
    });
  });

  it("a journey email claims the donor's week, shared with the thank-you and the s18A reminder", async () => {
    await tx(async () => {
      const d = await donor();
      await run("insert into public.charity_donor_thanks (charity_id, donor_id, week_start, kind, body) values ($1, $2, '2026-11-09', 'journey', 'Donor journey email 1: Welcome')", [charity, d]);
      await refused("insert into public.charity_donor_thanks (charity_id, donor_id, week_start, body) values ($1, $2, '2026-11-09', 'Thank you so much.')", [charity, d], /duplicate/);
      await refused("insert into public.charity_donor_thanks (charity_id, donor_id, week_start, kind, body) values ($1, $2, '2026-11-16', 'newsletter', 'Something else entirely.')", [charity, d], /donor_message_kind/);
      await run("insert into public.charity_donor_thanks (charity_id, donor_id, week_start, kind, body) values ($1, $2, '2026-11-16', 's18a_details_reminder', 'A reminder to add the details for an s18A receipt.')", [charity, d]);
    });
  });

  it("everything goes with the charity, and a donor's place goes with the donor", async () => {
    await tx(async () => {
      const fk = (await run(
        "select c.conrelid::regclass::text as tbl, a.attname::text as col, c.confdeltype::text as rule from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1] where c.contype = 'f' and c.conrelid = any($1::regclass[])",
        [TABLES.map((t) => `public.${t}`)],
      )).rows.map((r) => ({ tbl: String(r.tbl).replace(/^public\./, ""), col: r.col, rule: r.rule })).sort((a, b) => (a.tbl + " " + a.col < b.tbl + " " + b.col ? -1 : 1));
      // c = cascade, n = set null.
      // Since 20261110000011 each journey has its own id: steps and enrolments belong to a journey, and a campaign's
      // journey goes with its campaign.
      expect(fk).toEqual([
        { tbl: "charity_journey_enrolments", col: "charity_id", rule: "c" },
        { tbl: "charity_journey_enrolments", col: "donor_id", rule: "c" },
        { tbl: "charity_journey_enrolments", col: "journey_id", rule: "c" },
        { tbl: "charity_journey_sends", col: "charity_id", rule: "c" },
        { tbl: "charity_journey_sends", col: "enrolment_id", rule: "c" },
        { tbl: "charity_journey_steps", col: "charity_id", rule: "c" },
        { tbl: "charity_journey_steps", col: "journey_id", rule: "c" },
        { tbl: "charity_journeys", col: "campaign_id", rule: "c" },
        { tbl: "charity_journeys", col: "charity_id", rule: "c" },
        { tbl: "charity_journeys", col: "updated_by", rule: "n" },
      ]);
    });
  });
});
