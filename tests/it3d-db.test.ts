/**
 * The charity's SARS details for its IT3(d) (migration 20261103000001): kept in charity_private, never public,
 * checked by the database, and written only by the server. Needs the local Supabase, seeded.
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
const as = async (user: string | null) => {
  await run(user ? "set local role authenticated" : "set local role anon");
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(user ? { sub: user, role: "authenticated", aal: "aal2", amr: [{ method: "otp" }] } : { role: "anon" })]);
};
async function refused(sql: string, args: unknown[], pattern: RegExp) {
  await run("savepoint s");
  await expect(run(sql, args)).rejects.toThrow(pattern);
  await run("rollback to savepoint s");
}

describe("charity SARS details", () => {
  it("the database refuses a tax reference, legal form or registration number of the wrong shape", async () => {
    await tx(async () => {
      await refused("update public.charity_private set tax_reference_number = '4001339050' where charity_id = $1", [charity], /charity_tax_reference_shape/);
      await refused("update public.charity_private set tax_reference_number = '000133905' where charity_id = $1", [charity], /charity_tax_reference_shape/);
      await refused("update public.charity_private set legal_form = 'PRIVATE_CO' where charity_id = $1", [charity], /charity_legal_form_code/);
      await refused("update public.charity_private set registration_number = '' where charity_id = $1", [charity], /charity_registration_number_shape/);
      await run("update public.charity_private set tax_reference_number = '0001339050', legal_form = 'OTHER_CO', registration_number = '2010/123456/08' where charity_id = $1", [charity]);
      const row = (await run("select tax_reference_number, legal_form, registration_number from public.charity_private where charity_id = $1", [charity])).rows[0];
      expect(row).toEqual({ tax_reference_number: "0001339050", legal_form: "OTHER_CO", registration_number: "2010/123456/08" });
    });
  });

  it("only the server writes them: the charity's own admin can't, even with the second step, but can still change the contact", async () => {
    await tx(async () => {
      await run("update public.charity_private set tax_reference_number = null, legal_form = null where charity_id = $1", [charity]);
      await as(admin);
      await refused("update public.charity_private set tax_reference_number = '0001339050' where charity_id = $1", [charity], /only be changed through the website/);
      await refused("update public.charity_private set legal_form = 'OTHER_CO' where charity_id = $1", [charity], /only be changed through the website/);
      const ok = await run("update public.charity_private set contact_name = 'Changed Name' where charity_id = $1 returning charity_id", [charity]);
      expect(ok.rowCount).toBe(1);
      await run("reset role");
      await run("set local role service_role");
      const server = await run("update public.charity_private set tax_reference_number = '0001339050' where charity_id = $1 returning charity_id", [charity]);
      expect(server.rowCount).toBe(1);
    });
  });

  it("are not public: nobody signed out, and no other charity's admin, can read them", async () => {
    await tx(async () => {
      await run("update public.charity_private set tax_reference_number = '0001339050' where charity_id = $1", [charity]);
      await as(otherAdmin);
      expect((await run("select tax_reference_number from public.charity_private where charity_id = $1", [charity])).rowCount).toBe(0);
      await run("reset role");
      await as(null);
      await refused("select tax_reference_number from public.charity_private where charity_id = $1", [charity], /permission denied/);
      await run("reset role");
      await as(admin);
      expect((await run("select tax_reference_number from public.charity_private where charity_id = $1", [charity])).rows[0]?.tax_reference_number).toBe("0001339050");
    });
  });
});
