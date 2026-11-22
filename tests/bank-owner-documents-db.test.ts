/**
 * The last fixes from the code review (migration 20261122000001, 22/11/2026), in the database:
 * - change_charity_bank saves the new account, marks it checked and takes the charity off the payment provider in one
 *   step, and hands back what was there before;
 * - remove_charity_member never removes the last owner; make_charity_owner hands ownership over, the old owner
 *   staying on as an admin;
 * - a browser can no longer add or change a document record (removing one while applying is unchanged);
 * - none of the three functions can be run from a browser.
 * Fixtures are built in a transaction that is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
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
async function refused(sql: string, args: unknown[], pattern: RegExp) {
  await run("savepoint attempt");
  await expect(run(sql, args)).rejects.toThrow(pattern);
  await run("rollback to savepoint attempt");
}

let seq = 0;
const stamp = () => `${++seq}-${Date.now()}`;
async function charity(status = "approved", subaccount: string | null = "ACCT_old") {
  const { id } = await one(
    `insert into public.charities (slug, quickgive_code, name_en, legal_name_en, status, gateway, gateway_subaccount_ref)
     values ($1, $2, 'Test', 'Test NPC', $3, $4, $5) returning id`,
    [`bod-${stamp()}`, `B${seq}${String(Date.now()).slice(-5)}`, status, subaccount ? "test" : null, subaccount],
  );
  await run(
    `insert into public.charity_private (charity_id, contact_email, bank_name, bank_account_holder, bank_account_number_encrypted, bank_account_last4, bank_branch_code, bank_verified_at)
     values ($1, 'old@x.test', 'FNB', 'Test NPC', 'v1.old', '1234', '250655', null)
     on conflict (charity_id) do update set contact_email = excluded.contact_email, bank_name = excluded.bank_name,
       bank_account_holder = excluded.bank_account_holder, bank_account_number_encrypted = excluded.bank_account_number_encrypted,
       bank_account_last4 = excluded.bank_account_last4, bank_branch_code = excluded.bank_branch_code, bank_verified_at = null`,
    [id],
  );
  return id as string;
}
async function user() {
  const { id } = await one("insert into auth.users (id, email, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated') returning id", [`bod${stamp()}@x.test`]);
  return id as string;
}
const member = (c: string, u: string, role: string) => run("insert into public.charity_admins (charity_id, user_id, role) values ($1, $2, $3)", [c, u, role]);
const roles = async (c: string) =>
  Object.fromEntries((await run("select user_id, role::text from public.charity_admins where charity_id = $1", [c])).rows.map((r) => [r.user_id, r.role]));
async function asBrowser(u: string) {
  await run("set local role authenticated");
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: u, role: "authenticated", aal: "aal2", amr: [{ method: "otp" }] })]);
}

describe("Givezy changing a charity's bank details (one step)", () => {
  it("saves the new account as checked, takes the charity off the payment provider, and says what was there", async () => {
    await tx(async () => {
      const c = await charity();
      const r = await one("select * from public.change_charity_bank($1, 'Nedbank', 'Test NPC', 'v1.new', '9876', '198765')", [c]);
      expect(r).toMatchObject({ was_connected: true, before_bank_name: "FNB", before_last4: "1234", contact_email: "old@x.test" });
      const p = await one("select bank_name, bank_account_number_encrypted, bank_account_last4, bank_branch_code, bank_verified_at from public.charity_private where charity_id = $1", [c]);
      expect(p).toMatchObject({ bank_name: "Nedbank", bank_account_number_encrypted: "v1.new", bank_account_last4: "9876", bank_branch_code: "198765" });
      expect(p.bank_verified_at).not.toBeNull();
      expect(await one("select gateway, gateway_subaccount_ref from public.charities where id = $1", [c])).toEqual({ gateway: null, gateway_subaccount_ref: null });
    });
  });

  it("a charity not yet connected stays unconnected, and says so", async () => {
    await tx(async () => {
      const c = await charity("approved", null);
      expect((await one("select * from public.change_charity_bank($1, 'Nedbank', 'Test NPC', 'v1.new', '9876', '198765')", [c])).was_connected).toBe(false);
    });
  });

  it("all or nothing: when the second half fails, the new account isn't kept either", async () => {
    await tx(async () => {
      const c = await charity();
      // Make taking the charity off the provider fail, as a dropped connection or a refused write would.
      await run(`create function pg_temp.no_unlink() returns trigger language plpgsql as $$ begin raise exception 'unlink failed'; end $$`);
      await run("create trigger no_unlink before update of gateway_subaccount_ref on public.charities for each row execute function pg_temp.no_unlink()");
      await refused("select * from public.change_charity_bank($1, 'Nedbank', 'Test NPC', 'v1.new', '9876', '198765')", [c], /unlink failed/);
      await run("drop trigger no_unlink on public.charities");
      const p = await one("select bank_name, bank_account_last4, bank_verified_at from public.charity_private where charity_id = $1", [c]);
      expect(p).toEqual({ bank_name: "FNB", bank_account_last4: "1234", bank_verified_at: null });
      expect((await one("select gateway_subaccount_ref from public.charities where id = $1", [c])).gateway_subaccount_ref).toBe("ACCT_old");
    });
  });

  it("an unknown charity is refused", async () => {
    await tx(async () => {
      await refused("select * from public.change_charity_bank(gen_random_uuid(), 'Nedbank', 'X', 'v1.new', '9876', '198765')", [], /Charity not found/);
    });
  });
});

describe("a charity always has an owner", () => {
  it("the only owner can't be removed; with a second owner, one can go", async () => {
    await tx(async () => {
      const c = await charity("draft", null);
      const owner = await user(), helper = await user();
      await member(c, owner, "owner");
      await member(c, helper, "admin");
      expect((await one("select public.remove_charity_member($1, $2) as r", [c, owner])).r).toBe("last_owner");
      expect((await roles(c))[owner]).toBe("owner");
      expect((await one("select public.remove_charity_member($1, $2) as r", [c, helper])).r).toBe("done");
      expect((await one("select public.remove_charity_member($1, $2) as r", [c, helper])).r).toBe("gone");
      const second = await user();
      await member(c, second, "owner");
      expect((await one("select public.remove_charity_member($1, $2) as r", [c, owner])).r).toBe("done");
      expect(await roles(c)).toEqual({ [second]: "owner" });
    });
  });

  it("handing ownership over: the new owner takes it, the old one stays on as an admin", async () => {
    await tx(async () => {
      const c = await charity("draft", null);
      const owner = await user(), helper = await user();
      await member(c, owner, "owner");
      await member(c, helper, "finance");
      expect((await one("select public.make_charity_owner($1, $2) as r", [c, helper])).r).toBe("done");
      expect(await roles(c)).toEqual({ [owner]: "admin", [helper]: "owner" });
      expect((await one("select public.make_charity_owner($1, $2) as r", [c, helper])).r).toBe("already");
      expect((await one("select public.make_charity_owner($1, gen_random_uuid()) as r", [c])).r).toBe("gone");
      // Now the old owner can be removed; the new one can't.
      expect((await one("select public.remove_charity_member($1, $2) as r", [c, owner])).r).toBe("done");
      expect((await one("select public.remove_charity_member($1, $2) as r", [c, helper])).r).toBe("last_owner");
    });
  });
});

describe("document records are written by the server only", () => {
  it("a charity's own owner can't add or change a record from the browser, and can still remove one while applying", async () => {
    await tx(async () => {
      const c = await charity("draft", null);
      const owner = await user();
      await member(c, owner, "owner");
      const { id: doc } = await one(
        "insert into public.charity_documents (charity_id, document_type, storage_path, file_name, uploaded_by) values ($1, 'npo_certificate', $2, 'npo.pdf', $3) returning id",
        [c, `${c}/npo_certificate-x.pdf`, owner],
      );
      await asBrowser(owner);
      await refused(
        "insert into public.charity_documents (charity_id, document_type, storage_path, file_name, uploaded_by) values ($1, 'npo_certificate', 'nowhere.pdf', 'fake.pdf', $2)",
        [c, owner],
        /permission denied|row-level security/,
      );
      await refused("update public.charity_documents set storage_path = 'elsewhere.pdf' where id = $1", [doc], /permission denied/);
      const gone = await run("delete from public.charity_documents where id = $1 returning id", [doc]);
      expect(gone.rowCount).toBe(1);
      await run("reset role");
    });
  });
});

describe("none of it can be run from a browser", () => {
  it("only the server may call the three functions", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const fn of [
        "public.change_charity_bank(uuid, text, text, text, text, text)",
        "public.remove_charity_member(uuid, uuid)",
        "public.make_charity_owner(uuid, uuid)",
      ]) {
        expect((await one("select has_function_privilege($1, $2, 'execute') as x", [role, fn])).x).toBe(false);
      }
      for (const priv of ["insert", "update"]) {
        expect((await one("select has_table_privilege($1, 'public.charity_documents', $2) as x", [role, priv])).x).toBe(false);
      }
    }
    for (const fn of ["public.change_charity_bank(uuid, text, text, text, text, text)", "public.remove_charity_member(uuid, uuid)", "public.make_charity_owner(uuid, uuid)"]) {
      expect((await one("select has_function_privilege('service_role', $1, 'execute') as x", [fn])).x).toBe(true);
    }
  });

  it("a bank check keeps which exact account it was about", async () => {
    const col = await one("select data_type from information_schema.columns where table_schema = 'public' and table_name = 'charity_bank_checks' and column_name = 'account_key'");
    expect(col?.data_type).toBe("text");
  });
});
