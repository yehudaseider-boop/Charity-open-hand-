/**
 * Erasing a person removes a charity's imported copy of them (20/11/2026): src/lib/privacy/erase.ts deletes their
 * rows from charity_contacts by the whole address (`.eq("email", address)`, lower-case, as imports store it). This
 * checks what that delete relies on in the database: the contact's tags go with it (the foreign key cascades), an
 * address with "_" or "%" in it removes only itself, and running it again changes nothing. Fixtures are built in a
 * transaction that is rolled back; no seed data is needed.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
beforeAll(() => client.connect());
afterAll(() => client.end());

const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
const one = async (sql: string, args: unknown[] = []) => (await run(sql, args)).rows[0];
const count = async (sql: string, args: unknown[] = []) => Number((await one(sql, args)).count);
async function tx(fn: () => Promise<void>) {
  await run("begin");
  try {
    await fn();
  } finally {
    await run("rollback");
  }
}
let seq = 0;
const stamp = () => `${++seq}-${Date.now()}`;

async function charityWithList(emails: string[]) {
  const { id: owner } = await one("insert into auth.users (id, email, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated') returning id", [`e${stamp()}@x.test`]);
  const { id: charity } = await one(
    `insert into public.charities (slug, quickgive_code, name_en, legal_name_en, status) values ($1, $2, 'C', 'C NPC', 'approved') returning id`,
    [`e-${stamp()}`, `E${String(Date.now()).slice(-6)}${seq}`],
  );
  await run("insert into public.charity_admins (charity_id, user_id, role) values ($1, $2, 'owner')", [charity, owner]);
  const contacts = emails.map((email) => ({ first_name: "Anna", last_name: "Example", email, tags: ["Volunteer"] }));
  const imp = { file_name: "donors.csv", file_fingerprint: "e".repeat(32), confirmed_at: new Date().toISOString(), confirmation_version: "contacts-2026-11-02" };
  await run("select public.import_charity_contacts($1, $2, $3, $4)", [charity, owner, imp, JSON.stringify(contacts)]);
  return charity as string;
}
/** The delete eraseDonor makes for one address. */
const erase = async (address: string) => (await run("delete from public.charity_contacts where email = $1", [address])).rowCount;

describe("a charity's imported copy of an erased person", () => {
  it("goes with its tags, matched on the whole address only, and a second run changes nothing", async () => {
    await tx(async () => {
      const charity = await charityWithList(["a_b%c@x.test", "axbyc@x.test", "aab%%c@x.test"]);
      expect(await count("select count(*) from public.charity_contact_tags where charity_id = $1", [charity])).toBe(3);
      expect(await erase("a_b%c@x.test")).toBe(1);
      expect((await run("select email from public.charity_contacts where charity_id = $1 order by email", [charity])).rows.map((r) => r.email)).toEqual([
        "aab%%c@x.test",
        "axbyc@x.test",
      ]);
      // The erased contact's tag link went with it; the others' stay.
      expect(await count("select count(*) from public.charity_contact_tags where charity_id = $1", [charity])).toBe(2);
      expect(await erase("a_b%c@x.test")).toBe(0);
    });
  });
});
