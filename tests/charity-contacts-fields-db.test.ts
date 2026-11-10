/**
 * The donor import's optional phone number and postal address in the database (CRM build plan step 8): stored
 * as checked, refused when malformed, gone when the import is removed (Undo), and no column anywhere on a contact
 * for an ID or tax number (decided 10/11/2026: nothing uses one for a person who hasn't given, so none is kept).
 * No new migration: the columns came with 20261102000002. Needs the local Supabase, seeded.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
let charity: string, admin: string;
beforeAll(async () => {
  await client.connect();
  charity = (await run("select id from public.charities where slug = $1", ["northcliff-meals-fund"])).rows[0].id;
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
const imp = (fp: string) => ({ file_name: "donors.csv", file_fingerprint: fp, confirmed_at: new Date().toISOString(), confirmation_version: "contacts-2026-11-02" });
const importFile = async (contacts: unknown[], fp = "d".repeat(32)) => (await run("select public.import_charity_contacts($1, $2, $3, $4) as r", [charity, admin, imp(fp), JSON.stringify(contacts)])).rows[0].r;
const full = { first_name: "Anna", last_name: "Example", email: "anna.fields@x.test", phone: "+27821234567", address_line1: "5 Example Road", address_line2: "Unit 2", suburb: "Example Suburb", city: "Pretoria", postal_code: "0157" };

describe("a contact's phone number and address", () => {
  it("are stored as checked, empty when left out, and removed with the import", async () => {
    await tx(async () => {
      const ok = await importFile([full, { first_name: "Ben", phone: "", address_line1: "", postal_code: "" }, { organisation_name: "Example Trust", phone: "0111234567" }]);
      const rows = (await run("select first_name, phone, address_line1, address_line2, suburb, city, postal_code from public.charity_contacts where import_id = $1 order by first_name nulls last", [ok.import_id])).rows;
      expect(rows[0]).toEqual({ first_name: "Anna", phone: "+27821234567", address_line1: "5 Example Road", address_line2: "Unit 2", suburb: "Example Suburb", city: "Pretoria", postal_code: "0157" });
      expect(rows[1]).toEqual({ first_name: "Ben", phone: null, address_line1: null, address_line2: null, suburb: null, city: null, postal_code: null });
      expect(rows[2].phone).toBe("0111234567");
      // Undo (and "Remove" later) takes the whole import: no phone number or address stays behind.
      expect((await run("select public.remove_charity_contact_import($1, $2) as n", [charity, ok.import_id])).rows[0].n).toBe(3);
      expect(Number((await run("select count(*) from public.charity_contacts where charity_id = $1 and (phone is not null or address_line1 is not null or postal_code is not null)", [charity])).rows[0].count)).toBe(0);
    });
  });

  it("the database refuses a malformed phone number or postal code and an over-long address, and then nothing of the file is kept", async () => {
    await tx(async () => {
      let n = 0;
      for (const [bad, pattern] of [
        [{ phone: "821234567" }, /contact_phone/],
        [{ phone: "27821234567" }, /contact_phone/],
        [{ phone: "=0821234567" }, /contact_phone/],
        [{ postal_code: "157" }, /contact_postal_code/],
        [{ postal_code: "21920" }, /contact_postal_code/],
        [{ address_line1: "a".repeat(201) }, /contact_address1/],
        [{ city: "c".repeat(81) }, /contact_city/],
      ] as const) {
        await run("savepoint s");
        await expect(importFile([full, { first_name: "Bad", ...bad }], String(n++).repeat(32))).rejects.toThrow(pattern);
        await run("rollback to savepoint s");
      }
      expect(Number((await run("select count(*) from public.charity_contacts where charity_id = $1", [charity])).rows[0].count)).toBe(0);
    });
  });

  it("a contact has nowhere to keep an ID or tax number, and one sent to the import is dropped", async () => {
    await tx(async () => {
      const columns = (await run("select column_name from information_schema.columns where table_schema = 'public' and table_name in ('charity_contacts', 'charity_contact_imports')")).rows.map((r) => r.column_name as string);
      expect(columns.filter((c) => /id_number|tax|passport|identity|encrypted/.test(c))).toEqual([]);
      const ok = await importFile([{ ...full, id_number: "8001015009087", tax_reference: "0001339050" }]);
      const row = (await run("select to_jsonb(c) as j from public.charity_contacts c where import_id = $1", [ok.import_id])).rows[0].j;
      expect(JSON.stringify(row)).not.toMatch(/8001015009087|0001339050/);
    });
  });
});
