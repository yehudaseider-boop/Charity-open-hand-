/**
 * Changes to a public charity's profile made outside the website (migration 20261123000002, 23/11/2026):
 * - a charity's own people changing its name, logo, cover, description, website or impact figure, from any path
 *   (here: straight through the database, as a browser could), leaves one charity.profile_changed audit row with the
 *   fields that changed, the old and new name, and a fingerprint of each change;
 * - the fingerprints match the website's own (changePrint in src/lib/charity/profile-changes.ts), so the daily email can
 *   leave out the website's saves;
 * - nothing is recorded for a charity that isn't public yet, for a change to other columns, or for the server;
 * - the browser still can't write the audit log itself, and grants and RLS are otherwise unchanged.
 * Fixtures are built in a transaction that is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { changePrint, changesOutsideWebsite, siteChanges } from "@/lib/charity/profile-changes";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
beforeAll(() => client.connect());
afterAll(() => client.end());

const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
const one = async (sql: string, args: unknown[] = []) => (await run(sql, args)).rows[0];
async function tx(fn: () => Promise<void>) {
  await run("begin");
  // A name or description change recomputes the search column, which calls extensions.unaccent as the signed-in
  // person. Supabase lets every role run extension functions; a plain Postgres test database may not, so it is allowed
  // here, inside the transaction that is rolled back.
  await run("grant execute on all functions in schema extensions to authenticated");
  try {
    await fn();
  } finally {
    await run("rollback");
  }
}

let seq = 0;
const stamp = () => `${++seq}-${Date.now()}`;
async function charity(status = "approved") {
  const { id } = await one(
    `insert into public.charities (slug, quickgive_code, name_en, legal_name_en, status, impact_unit_cents, impact_unit_one, impact_unit_many)
     values ($1, $2, 'Hillside Soup Kitchen', 'Hillside NPC', $3, 5000, 'meal', 'meals') returning id`,
    [`pca-${stamp()}`, `P${seq}${String(Date.now()).slice(-5)}`, status],
  );
  // Pictures live in the charity's own folder. Set by the server here (not recorded: no signed-in person).
  await run("update public.charities set logo_path = $2 where id = $1", [id, `${id}/logo-1.png`]);
  return id as string;
}
async function user() {
  const { id } = await one("insert into auth.users (id, email, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated') returning id", [`pca${stamp()}@x.test`]);
  return id as string;
}
const member = (c: string, u: string, role: string) => run("insert into public.charity_admins (charity_id, user_id, role) values ($1, $2, $3)", [c, u, role]);
async function asBrowser(u: string) {
  await run("set local role authenticated");
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: u, role: "authenticated", aal: "aal2", amr: [{ method: "otp" }] })]);
}
const changes = async (c: string) =>
  (await run("select actor_user_id, entity_id, created_at, details from public.audit_log where action = 'charity.profile_changed' and entity_id = $1 order by id", [c])).rows;

describe("a public charity's profile changed straight through the database", () => {
  it.each(["owner", "admin", "fundraiser"])("by its %s is recorded, with what changed and the old and new name", async (role) => {
    await tx(async () => {
      const c = await charity();
      const u = await user();
      await member(c, u, role);
      await asBrowser(u);
      await run("update public.charities set name_en = 'Hillside Kitchen', logo_path = $2, impact_unit_cents = 6000 where id = $1", [c, `${c}/logo-2.png`]);
      await run("reset role");
      const rows = await changes(c);
      expect(rows).toHaveLength(1);
      expect(rows[0].actor_user_id).toBe(u);
      expect(rows[0].details).toMatchObject({
        fields: ["name_en", "logo_path", "impact_unit_cents"],
        name: "Hillside Kitchen",
        name_from: "Hillside Soup Kitchen",
        name_to: "Hillside Kitchen",
      });
      // The database's fingerprints are the website's, so a website save is matched and not reported twice.
      expect(rows[0].details.prints).toEqual({
        name_en: changePrint("Hillside Soup Kitchen", "Hillside Kitchen"),
        logo_path: changePrint(`${c}/logo-1.png`, `${c}/logo-2.png`),
        impact_unit_cents: changePrint(5000, 6000),
      });
      expect(siteChanges({ name_en: "Hillside Soup Kitchen", logo_path: `${c}/logo-1.png`, impact_unit_cents: 5000 }, { name_en: "Hillside Kitchen", logo_path: `${c}/logo-2.png`, impact_unit_cents: 6000 })).toEqual(rows[0].details.prints);
    });
  });

  it("records the cover, description, website and figure words too, and a field cleared to empty", async () => {
    await tx(async () => {
      const c = await charity();
      const u = await user();
      await member(c, u, "owner");
      await asBrowser(u);
      await run("update public.charities set cover_path = $2, description_en = 'Hot meals every night', website = 'https://example.org', impact_unit_one = 'plate', impact_unit_many = 'plates' where id = $1", [c, `${c}/cover-1.png`]);
      await run("update public.charities set logo_path = null where id = $1", [c]);
      await run("reset role");
      const rows = await changes(c);
      expect(rows.map((r) => r.details.fields)).toEqual([["cover_path", "description_en", "website", "impact_unit_one", "impact_unit_many"], ["logo_path"]]);
      expect(rows[0].details.name_from).toBeUndefined();
      expect(rows[1].details.prints.logo_path).toBe(changePrint(`${c}/logo-1.png`, null));
    });
  });

  it("a change the website made is matched by its own audit row; one made outside it is reported", async () => {
    await tx(async () => {
      const c = await charity();
      const u = await user();
      await member(c, u, "owner");
      await asBrowser(u);
      await run("update public.charities set name_en = 'Hillside Kitchen' where id = $1", [c]);
      await run("reset role");
      const [row] = await changes(c);
      const at = new Date(row.created_at).getTime();
      const websiteSave = (prints: Record<string, string>) => ({ actor_user_id: u, entity_id: c, created_at: new Date(at + 500).toISOString(), details: { site_changes: prints } });
      expect(changesOutsideWebsite([row], [websiteSave(siteChanges({ name_en: "Hillside Soup Kitchen" }, { name_en: "Hillside Kitchen" }))])).toEqual([]);
      // A website save of something else (or the same name from another starting point) doesn't account for it.
      expect(changesOutsideWebsite([row], [websiteSave(siteChanges({ name_en: "Hillside Kitchen" }, { name_en: "Hillside Kitchen 2" }))])).toHaveLength(1);
      expect(changesOutsideWebsite([row], [])).toHaveLength(1);
    });
  });

  it("is not recorded for a charity that isn't public yet, for other columns, for the server, or when nothing changed", async () => {
    await tx(async () => {
      const draft = await charity("draft");
      const live = await charity();
      const u = await user();
      await member(draft, u, "owner");
      await member(live, u, "owner");
      await asBrowser(u);
      await run("update public.charities set name_en = 'Draft Name', logo_path = $2 where id = $1", [draft, `${draft}/logo-9.png`]);
      await run("update public.charities set funds_use_en = 'Food' where id = $1", [live]);
      await run("update public.charities set name_en = name_en, logo_path = logo_path where id = $1", [live]);
      await run("reset role");
      // The server (service role, no signed-in person: undo, Givezy's admin pages) is not recorded here.
      await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
      await run("update public.charities set name_en = 'Server Rename' where id = $1", [live]);
      expect(await changes(draft)).toEqual([]);
      expect(await changes(live)).toEqual([]);
    });
  });

  it("a suspended charity's changes are recorded too", async () => {
    await tx(async () => {
      const c = await charity("suspended");
      const u = await user();
      await member(c, u, "owner");
      await asBrowser(u);
      await run("update public.charities set logo_path = $2 where id = $1", [c, `${c}/logo-3.png`]);
      await run("reset role");
      expect((await changes(c)).map((r) => r.details.fields)).toEqual([["logo_path"]]);
    });
  });

  it("a browser still can't write to the audit log or run the trigger function itself", async () => {
    await tx(async () => {
      const u = await user();
      await asBrowser(u);
      await run("savepoint a");
      await expect(run("insert into public.audit_log (action, entity_type) values ('charity.profile_changed', 'charity')")).rejects.toThrow(/permission denied|row-level security/);
      await run("rollback to savepoint a");
      await run("reset role");
      const grants = (await run("select has_function_privilege('authenticated', 'public.audit_charity_profile_change()', 'execute') as can")).rows[0];
      expect(grants.can).toBe(false);
    });
  });
});
