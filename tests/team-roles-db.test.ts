/**
 * Team roles in the database (migration 20261110000009, CRM step 9, approved 10/11/2026): each role can and can't
 * do each row of the table, wherever a signed-in member reaches the database directly; a viewer never gets a
 * donor's email, phone or address from the charity view or functions; another charity's members get nothing.
 * Builds its own fixtures in a transaction that is rolled back; needs only the migrations applied.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
beforeAll(() => client.connect());
afterAll(() => client.end());

const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
const one = async (sql: string, args: unknown[] = []) => (await run(sql, args)).rows[0];
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

type Role = "owner" | "admin" | "finance" | "fundraiser" | "viewer";
const ROLES: Role[] = ["owner", "admin", "finance", "fundraiser", "viewer"];

/** The approved table (src/lib/charity/permissions.ts): which roles have each permission. */
const TABLE: Record<string, Role[]> = {
  view: ["owner", "admin", "finance", "fundraiser", "viewer"],
  contact: ["owner", "admin", "finance", "fundraiser"],
  message: ["owner", "admin", "fundraiser"],
  profile: ["owner", "admin", "fundraiser"],
  receipts: ["owner", "admin", "finance"],
  export: ["owner", "admin", "finance"],
  gifts: ["owner", "admin", "finance"],
  application: ["owner", "admin"],
  bank_view: ["owner", "finance"],
  bank_edit: ["owner"],
  owner: ["owner"],
};

async function user(role: "user" | "platform_admin" = "user") {
  const { id } = await one("insert into auth.users (id, email, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated') returning id", [`u${stamp()}@x.test`]);
  if (role !== "user") await run("update public.profiles set role = $2 where id = $1", [id, role]);
  return id as string;
}
async function charity() {
  const { id } = await one(
    `insert into public.charities (slug, quickgive_code, name_en, legal_name_en, status) values ($1, $2, 'C', 'C NPC', 'approved') returning id`,
    [`c-${stamp()}`, `R${String(Date.now()).slice(-6)}${seq}`],
  );
  await run(
    `insert into public.charity_private (charity_id, contact_name, contact_email, bank_name, bank_account_holder, bank_account_last4, bank_branch_code)
     values ($1, 'Lerato', 'office@c.test', 'Capitec Business', 'C NPC', '1234', '450105')
     on conflict (charity_id) do update set contact_name = excluded.contact_name, bank_account_last4 = excluded.bank_account_last4`,
    [id],
  );
  return id as string;
}
const member = (c: string, u: string, role: Role) => run("insert into public.charity_admins (charity_id, user_id, role) values ($1, $2, $3)", [c, u, role]);
async function gift(c: string, email = "thandi@x.test") {
  const { id: donor } = await one(
    `insert into public.donors (email, donor_type, age_confirmed_18_at, popia_consent_at) values ($1, 'individual', now(), now()) returning id`,
    [`d${stamp()}@x.test`],
  );
  const { id } = await one(
    `insert into public.donations (donor_id, charity_id, amount_cents, platform_fee_cents, processing_charge_cents, total_charged_cents, gateway, gateway_ref, status, paid_at, tax_year)
     values ($1, $2, 10000::bigint, 400, 100, 10500::bigint, 'test', gen_random_uuid()::text, 'paid', now(), 2027) returning id`,
    [donor, c],
  );
  await run(
    `insert into public.donation_checkout_details (donation_id, donor_type, email, first_name, last_name, phone, address_line1, city, postal_code)
     values ($1, 'individual', $2, 'Thandi', 'Mokoena', '0821234567', '12 Main Road', 'Soweto', '1804')`,
    [id, email],
  );
  return { donor: donor as string, donation: id as string };
}
const as = async (id: string, claims: Record<string, unknown> = {}) => {
  await run("set local role authenticated");
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated", aal: "aal2", amr: [{ method: "otp" }], ...claims })]);
};
const reset = () => run("reset role");
async function refused(sql: string, args: unknown[] = []) {
  await run("savepoint s");
  await expect(run(sql, args)).rejects.toThrow();
  await run("rollback to savepoint s");
}

/** One charity with a member in every role, one gift, one imported contact, and a stranger charity. */
async function team() {
  const c = await charity();
  const people = {} as Record<Role, string>;
  for (const r of ROLES) {
    people[r] = await user();
    await member(c, people[r], r);
  }
  const g = await gift(c);
  const { id: imp } = await one(
    `insert into public.charity_contact_imports (charity_id, file_name, file_fingerprint, contacts, confirmed_at, confirmation_version) values ($1, 'list.csv', md5($2), 1, now(), 'contacts-2026-11-02') returning id`,
    [c, stamp()],
  );
  await run(`insert into public.charity_contacts (charity_id, import_id, first_name, email, phone) values ($1, $2, 'Sipho', 'sipho@x.test', '0831234567')`, [c, imp]);
  const other = await charity();
  const stranger = await user();
  await member(other, stranger, "owner");
  return { c, people, g, other, stranger };
}

describe("team roles", () => {
  it("charity_can answers the approved table for every role and permission", async () => {
    await tx(async () => {
      const { c, people } = await team();
      for (const r of ROLES) {
        await as(people[r]);
        expect((await one("select public.charity_role($1) as r", [c])).r).toBe(r);
        for (const [perm, allowed] of Object.entries(TABLE)) {
          expect([r, perm, (await one("select public.charity_can($1, $2) as ok", [c, perm])).ok]).toEqual([r, perm, allowed.includes(r)]);
        }
        expect((await one("select public.charity_can($1, 'no_such_permission') as ok", [c])).ok).toBe(false);
        await reset();
      }
    });
  });

  it("gives nothing to another charity's owner, before the second step, in a password session, or to a visitor", async () => {
    await tx(async () => {
      const { c, people, stranger } = await team();
      await as(stranger);
      expect((await one("select public.charity_role($1) as r", [c])).r).toBeNull();
      expect((await one("select public.charity_can($1, 'view') as ok", [c])).ok).toBe(false);
      expect((await run("select id from public.charity_donations where charity_id = $1", [c])).rowCount).toBe(0);
      await refused("select * from public.charity_donor_list($1)", [c]);
      await reset();

      await as(people.owner, { aal: "aal1" });
      expect((await one("select public.charity_can($1, 'view') as ok", [c])).ok).toBe(false);
      await reset();

      await as(people.owner, { amr: [{ method: "password" }] });
      expect((await one("select public.charity_can($1, 'owner') as ok", [c])).ok).toBe(false);
      await reset();

      await run("set local role anon");
      await refused("select public.charity_can($1, 'view')", [c]);
      await reset();
    });
  });

  it("treats a Givezy platform admin as an owner", async () => {
    await tx(async () => {
      const { c } = await team();
      const admin = await user("platform_admin");
      await as(admin);
      expect((await one("select public.charity_role($1) as r", [c])).r).toBe("owner");
      expect((await one("select public.charity_can($1, 'bank_edit') as ok", [c])).ok).toBe(true);
      await reset();
    });
  });

  it("shows a viewer names and totals but no email, phone or address, from the view and every function", async () => {
    await tx(async () => {
      const { c, people } = await team();
      for (const r of ROLES) {
        await as(people[r]);
        const sees = TABLE.contact.includes(r);
        const row = await one("select first_name, last_name, amount_cents, email, phone, address_line1, city, postal_code, contact_person from public.charity_donations where charity_id = $1", [c]);
        expect(row.first_name).toBe("Thandi");
        expect(row.amount_cents).toBe("10000");
        expect([r, row.email, row.phone, row.address_line1, row.city, row.postal_code]).toEqual(
          sees ? [r, "thandi@x.test", "0821234567", "12 Main Road", "Soweto", "1804"] : [r, null, null, null, null, null],
        );
        const listed = await one("select display_name, total_cents, email, phone from public.charity_donor_list($1)", [c]);
        expect(listed.total_cents).toBe("10000");
        expect([r, listed.email, listed.phone]).toEqual(sees ? [r, "thandi@x.test", "0821234567"] : [r, null, null]);
        const kept = await run(
          "select email, phone from public.charity_keeping_donors($1, now() - interval '2 years', now() - interval '1 day', now() + interval '1 day', now())",
          [c],
        );
        for (const k of kept.rows) expect([r, k.email, k.phone]).toEqual(sees ? [r, "thandi@x.test", "0821234567"] : [r, null, null]);
        const lapsed = await run("select email, phone from public.charity_lapsed_monthly($1, now() - interval '1 year', now())", [c]);
        for (const l of lapsed.rows) if (!sees) expect([l.email, l.phone]).toEqual([null, null]);
        const monthly = await run("select email, phone from public.charity_monthly_list($1)", [c]);
        for (const m of monthly.rows) if (!sees) expect([m.email, m.phone]).toEqual([null, null]);
        // Imported contacts are contact details too.
        expect([r, (await run("select id from public.charity_contacts where charity_id = $1", [c])).rowCount]).toEqual([r, sees ? 1 : 0]);
        await reset();
      }
    });
  });

  it("still tells a viewer that a donor's details were erased", async () => {
    await tx(async () => {
      const { c, people } = await team();
      await gift(c, "erased-1234@erased.invalid");
      await as(people.viewer);
      const emails = (await run("select email from public.charity_donations where charity_id = $1", [c])).rows.map((r) => r.email);
      expect(emails).toContain("erased-1234@erased.invalid");
      expect(emails).not.toContain("thandi@x.test");
      await reset();
    });
  });

  it("closes the full functions behind the wrappers to every browser", async () => {
    await tx(async () => {
      const { c, people } = await team();
      await as(people.owner);
      await refused("select * from public.charity_donor_list_full($1)", [c]);
      await refused("select * from public.charity_monthly_list_full($1)", [c]);
      await refused("select * from public.charity_lapsed_monthly_full($1, now() - interval '1 year', now())", [c]);
      await refused("select * from public.charity_keeping_donors_full($1, now() - interval '2 years', now() - interval '1 day', now() + interval '1 day', now())", [c]);
      await reset();
    });
  });

  it("keeps the bank columns from every browser, while every member reads the contact details", async () => {
    await tx(async () => {
      const { c, people } = await team();
      for (const r of ROLES) {
        await as(people[r]);
        expect((await one("select contact_name from public.charity_private where charity_id = $1", [c])).contact_name).toBe("Lerato");
        await refused("select bank_account_last4 from public.charity_private where charity_id = $1", [c]);
        await refused("select bank_name from public.charity_private where charity_id = $1", [c]);
        await reset();
      }
      // The server (service role) still reads them, for the owner and finance.
      expect((await one("select bank_account_last4 from public.charity_private where charity_id = $1", [c])).bank_account_last4).toBe("1234");
    });
  });

  it("lets only the page roles change the page, photos, updates and campaigns", async () => {
    await tx(async () => {
      const { c, people } = await team();
      for (const r of ROLES) {
        await as(people[r]);
        const may = TABLE.profile.includes(r);
        const page = await run("update public.charities set video_provider = null, video_id = null where id = $1 returning id", [c]);
        expect([r, page.rowCount]).toEqual([r, may ? 1 : 0]);
        if (may) {
          const up = await run("insert into public.charity_updates (charity_id, body_en) values ($1, 'News from the kitchen') returning id", [c]);
          expect(up.rowCount).toBe(1);
          const camp = await run("insert into public.campaigns (charity_id, slug, title) values ($1, $2, 'Winter soup') returning id", [c, `w-${stamp()}`]);
          expect(camp.rowCount).toBe(1);
        } else {
          await refused("insert into public.charity_updates (charity_id, body_en) values ($1, 'News')", [c]);
          await refused("insert into public.campaigns (charity_id, slug, title) values ($1, $2, 'Winter soup')", [c, `w-${stamp()}`]);
        }
        // Everyone in the team still sees the campaigns and documents.
        await run("select id from public.campaigns where charity_id = $1", [c]);
        await run("select id from public.charity_documents where charity_id = $1", [c]);
        await reset();
      }
    });
  });

  it("lets the contact settings be changed by the page and application roles only", async () => {
    await tx(async () => {
      const { c, people } = await team();
      for (const r of ROLES) {
        await as(people[r]);
        const may = TABLE.profile.includes(r) || TABLE.application.includes(r);
        const res = await run("update public.charity_private set notify_donations = true where charity_id = $1 returning charity_id", [c]);
        expect([r, res.rowCount]).toEqual([r, may ? 1 : 0]);
        await reset();
      }
    });
  });

  it("keeps a changed role to the five known ones", async () => {
    await tx(async () => {
      const { c, people } = await team();
      await run("savepoint s");
      await expect(run("update public.charity_admins set role = 'superuser' where charity_id = $1 and user_id = $2", [c, people.viewer])).rejects.toThrow(/invalid input value/);
      await run("rollback to savepoint s");
      await run("update public.charity_admins set role = 'finance' where charity_id = $1 and user_id = $2", [c, people.viewer]);
      await as(people.viewer);
      expect((await one("select public.charity_can($1, 'export') as ok", [c])).ok).toBe(true);
      await reset();
    });
  });
  it("keeps the charity's contact person, email and phone to the owner, even where the row may be updated", async () => {
    await tx(async () => {
      const { c, people } = await team();
      for (const r of ROLES) {
        await as(people[r]);
        if (r === "owner") {
          const ok = await run("update public.charity_private set contact_phone = '0115550000' where charity_id = $1 returning charity_id", [c]);
          expect(ok.rowCount).toBe(1);
        } else if (TABLE.profile.includes(r) || TABLE.application.includes(r)) {
          for (const sql of [
            "update public.charity_private set contact_name = 'Someone else' where charity_id = $1",
            "update public.charity_private set contact_email = 'other@x.test' where charity_id = $1",
            "update public.charity_private set contact_phone = '0119990000' where charity_id = $1",
          ]) {
            await run("savepoint s");
            await expect(run(sql, [c])).rejects.toThrow(/only be changed by its owner/);
            await run("rollback to savepoint s");
          }
          // Their own settings still save.
          expect((await run("update public.charity_private set notify_donations = false where charity_id = $1 returning charity_id", [c])).rowCount).toBe(1);
        } else {
          expect((await run("update public.charity_private set contact_name = 'Someone else' where charity_id = $1 returning charity_id", [c])).rowCount).toBe(0);
        }
        await reset();
      }
      expect((await one("select contact_name from public.charity_private where charity_id = $1", [c])).contact_name).toBe("Lerato");
    });
  });

  it("keeps the bank confirmation letter, its record and its file, to the owner and finance", async () => {
    await tx(async () => {
      const { c, people } = await team();
      const letter = `${c}/bank_confirmation-${stamp()}.pdf`;
      const cert = `${c}/npo_certificate-${stamp()}.pdf`;
      await run("insert into public.charity_documents (charity_id, document_type, storage_path, file_name) values ($1, 'bank_confirmation', $2, 'bank.pdf'), ($1, 'npo_certificate', $3, 'npo.pdf')", [c, letter, cert]);
      await run("insert into storage.objects (bucket_id, name) values ('charity-documents', $1), ('charity-documents', $2)", [letter, cert]);
      for (const r of ROLES) {
        await as(people[r]);
        const sees = TABLE.bank_view.includes(r);
        const types = (await run("select document_type from public.charity_documents where charity_id = $1 order by document_type", [c])).rows.map((x) => x.document_type);
        expect([r, types]).toEqual([r, sees ? ["bank_confirmation", "npo_certificate"] : ["npo_certificate"]]);
        const files = (await run("select name from storage.objects where bucket_id = 'charity-documents' and name in ($1, $2) order by name", [letter, cert])).rows.map((x) => x.name);
        expect([r, files.includes(letter), files.includes(cert)]).toEqual([r, sees, true]);
        await reset();
      }
    });
  });

  it("lets only the owner and admins change the application's details, while page roles change the page", async () => {
    await tx(async () => {
      const { c, people } = await team();
      await run("update public.charities set status = 'draft' where id = $1", [c]);
      for (const r of ROLES) {
        await as(people[r]);
        const page = TABLE.profile.includes(r);
        const application = TABLE.application.includes(r);
        // A new value for each role: the guard only refuses a real change, and an update to the value an earlier role
        // already saved changes nothing.
        const n = ROLES.indexOf(r);
        for (const sql of [
          `update public.charities set legal_name_en = 'Changed NPC ${n}' where id = $1 returning id`,
          `update public.charities set npo_number = '12${n}-456 NPO' where id = $1 returning id`,
          `update public.charities set city = 'Durban ${n}' where id = $1 returning id`,
        ]) {
          if (application) {
            expect([r, sql, (await run(sql, [c])).rowCount]).toEqual([r, sql, 1]);
          } else if (page) {
            await run("savepoint s");
            await expect(run(sql, [c])).rejects.toThrow(/application details can only be changed by its owner or an admin/);
            await run("rollback to savepoint s");
          } else {
            expect([r, sql, (await run(sql, [c])).rowCount]).toEqual([r, sql, 0]);
          }
        }
        await reset();
      }
    });
  });
  it("has both guards on and no policy that widens who reads the documents", async () => {
    await tx(async () => {
      const triggers = (await run(
        "select tgname, tgenabled from pg_trigger where tgname in ('charity_private_contact_guard', 'charities_application_guard') order by tgname",
      )).rows;
      expect(triggers).toEqual([
        { tgname: "charities_application_guard", tgenabled: "O" },
        { tgname: "charity_private_contact_guard", tgenabled: "O" },
      ]);
      // Any policy that grants SELECT on charity_documents (FOR SELECT or FOR ALL) must be the read policy alone.
      const readers = (await run("select policyname from pg_policies where schemaname = 'public' and tablename = 'charity_documents' and cmd in ('SELECT', 'ALL') and permissive = 'PERMISSIVE'")).rows.map((p) => p.policyname);
      expect(readers).toEqual(["charity_documents_read"]);
    });
  });
});
