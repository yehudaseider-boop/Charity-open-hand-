/**
 * A charity's imported donors (contacts) are its own: never in public.donors, readable only by that charity's
 * admins with their second step, written only by the server, imported all or nothing and removed as a whole.
 * Needs the local Supabase, seeded.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
let charity: string, other: string, admin: string, otherAdmin: string;
beforeAll(async () => {
  await client.connect();
  charity = (await run("select id from public.charities where slug = $1", ["northcliff-meals-fund"])).rows[0].id;
  other = (await run("select id from public.charities where slug = $1", ["glenhazel-community-hall"])).rows[0].id;
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
const imp = (fp = "c".repeat(32)) => ({ file_name: "donors.csv", file_fingerprint: fp, confirmed_at: new Date().toISOString() });
const person = (email: string | null, tags: string[] = []) => ({ first_name: "Anna", last_name: "Example", email, phone: "0821234567", tags });
const importFile = async (contacts: unknown[], fp?: string) => (await run("select public.import_charity_contacts($1, $2, $3, $4) as r", [charity, admin, imp(fp), JSON.stringify(contacts)])).rows[0].r;
const count = async (sql: string, args: unknown[] = []) => Number((await run(sql, args)).rows[0].count);
const as = async (user: string, aal: string) => {
  await run("set local role authenticated");
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, role: "authenticated", aal, amr: [{ method: "otp" }] })]);
};

describe("charity contacts", () => {
  it("an import saves contacts and tags in one go, never touches donors, and one bad row saves nothing", async () => {
    await tx(async () => {
      const donors = await count("select count(*) from public.donors");
      await run("savepoint s");
      // The same email twice: the second is refused, and the first is not kept either.
      await expect(importFile([person("a@x.test"), person("a@x.test")])).rejects.toThrow(/charity_contacts_email/);
      await run("rollback to savepoint s");
      expect(await count("select count(*) from public.charity_contact_imports where charity_id = $1", [charity])).toBe(0);
      const ok = await importFile([person("a@x.test", ["Volunteer", "Brand new tag"]), person(null), { organisation_name: "Example Trust" }]);
      expect(ok.contacts).toBe(3);
      expect(await count("select count(*) from public.charity_contacts where import_id = $1", [ok.import_id])).toBe(3);
      expect(await count("select count(*) from public.charity_contact_tags ct join public.charity_contacts c on c.id = ct.contact_id where c.import_id = $1", [ok.import_id])).toBe(2);
      expect(await count("select count(*) from public.donors")).toBe(donors);
      await run("savepoint s2");
      await expect(importFile([person("b@x.test")])).rejects.toThrow(/charity_contact_imports_once/);
      await run("rollback to savepoint s2");
      // Removing the import removes its contacts, their tags and the tag it made; a tag that was already there stays.
      const made = await count("select count(*) from public.charity_tags where charity_id = $1 and name = 'Brand new tag'", [charity]);
      expect(made).toBe(1);
      expect((await run("select public.remove_charity_contact_import($1, $2) as n", [charity, ok.import_id])).rows[0].n).toBe(3);
      expect(await count("select count(*) from public.charity_contacts where charity_id = $1", [charity])).toBe(0);
      expect(await count("select count(*) from public.charity_tags where charity_id = $1 and name = 'Brand new tag'", [charity])).toBe(0);
      expect((await run("select public.remove_charity_contact_import($1, $2) as n", [charity, ok.import_id])).rows[0].n).toBe(0);
    });
  });

  it("only an approved charity can import, and a row can't cross two charities", async () => {
    await tx(async () => {
      await run("update public.charities set status = 'suspended' where id = $1", [charity]);
      await run("savepoint s");
      await expect(importFile([person("a@x.test")])).rejects.toThrow(/approved charity/);
      await run("rollback to savepoint s");
      await run("update public.charities set status = 'approved' where id = $1", [charity]);
      const ok = await importFile([person("a@x.test")]);
      await run("savepoint s2");
      await expect(run("insert into public.charity_contacts (charity_id, import_id, first_name) values ($1, $2, 'X')", [other, ok.import_id])).rejects.toThrow(/charity_contacts_import/);
      await run("rollback to savepoint s2");
      const otherTag = (await run("insert into public.charity_tags (charity_id, name) values ($1, 'Hall only') returning id", [other])).rows[0].id;
      const contact = (await run("select id from public.charity_contacts where import_id = $1", [ok.import_id])).rows[0].id;
      await expect(run("insert into public.charity_contact_tags (tag_id, charity_id, contact_id) values ($1, $2, $3)", [otherTag, charity, contact])).rejects.toThrow(/another charity/);
    });
  });

  it("the charity's own admins read them with their second step; nobody else, and no browser writes", async () => {
    await tx(async () => {
      await importFile([person("seen@x.test", ["Volunteer"])]);
      await as(admin, "aal2");
      expect(await count("select count(*) from public.charity_contacts where email = 'seen@x.test'")).toBe(1);
      expect(await count("select count(*) from public.charity_contact_imports")).toBe(1);
      expect(await count("select count(*) from public.charity_contact_tags")).toBe(1);
      for (const sql of [
        "insert into public.charity_contacts (charity_id, import_id, first_name) select charity_id, import_id, 'X' from public.charity_contacts limit 1",
        "update public.charity_contacts set note = 'x'",
        "delete from public.charity_contacts",
        "select public.import_charity_contacts(gen_random_uuid(), gen_random_uuid(), '{}'::jsonb, '[]'::jsonb)",
        "select public.remove_charity_contact_import(gen_random_uuid(), gen_random_uuid())",
      ]) {
        await run("savepoint s");
        await expect(run(sql)).rejects.toThrow(/permission denied/);
        await run("rollback to savepoint s");
      }
      // Without the second step: nothing.
      await run("reset role");
      await as(admin, "aal1");
      expect(await count("select count(*) from public.charity_contacts")).toBe(0);
      // Another charity's admin: nothing.
      await run("reset role");
      await as(otherAdmin, "aal2");
      expect(await count("select count(*) from public.charity_contacts")).toBe(0);
      expect(await count("select count(*) from public.charity_contact_imports")).toBe(0);
      // Not signed in: no access at all.
      await run("reset role");
      await run("set local role anon");
      await run("savepoint s");
      await expect(run("select * from public.charity_contacts")).rejects.toThrow(/permission denied/);
      await run("rollback to savepoint s");
    });
  });
});
