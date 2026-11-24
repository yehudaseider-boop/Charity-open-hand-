/**
 * Guards for the database's access rules (security review 18/11/2026, migration 20261118000001). They fail the day a
 * table or function is added open: a table without row-level security, a table a browser can reach without the
 * password-session guard, a security-definer function a visitor or signed-in person can run that is not on the list,
 * or a browser that can write to storage. Needs the local Supabase, seeded.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
beforeAll(async () => {
  await client.connect();
});
afterAll(() => client.end());

/**
 * Security-definer functions a browser may run on purpose: each checks the caller or answers only about the caller (reviewed
 * 18/11/2026). A new one is added here only after it has been reviewed the same way.
 */
const ANON_MAY_RUN = ["campaign_progress", "charity_can_issue_18a", "has_second_step", "is_charity_admin", "is_platform_admin", "signed_in_without_password"];
const SIGNED_IN_MAY_RUN = [
  ...ANON_MAY_RUN,
  "charity_application_open",
  "charity_can",
  "charity_contact_or_null",
  "charity_donor_list",
  "charity_insights",
  "charity_keeping_donors",
  "charity_keeping_summary",
  "charity_lapsed_monthly",
  "charity_monthly_list",
  "charity_monthly_totals",
  "charity_overview",
  "charity_role",
  "document_is_bank_letter",
  "link_my_donations",
  "my_donor_ids",
  "set_my_recurring_status",
];

describe("row-level security", () => {
  it("is on for every table in public", async () => {
    const r = await run("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1");
    expect(r.rows.map((x) => x.relname)).toEqual([]);
  });

  it("has the password-session guard on every table a browser can read or write (that has policies)", async () => {
    const r = await run(
      `select c.relname
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and (has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'insert')
               or has_table_privilege('authenticated', c.oid, 'update') or has_table_privilege('authenticated', c.oid, 'delete'))
          and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
          and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.policyname = 'no_password_sessions')
          and c.relname not in ('categories', 'charity_categories', 'charity_focus', 'charity_photos', 'campaigns')
        order by 1`,
    );
    expect(r.rows.map((x) => x.relname)).toEqual([]);
  });
});

describe("security-definer functions", () => {
  const open = async (role: "anon" | "authenticated") => {
    const r = await run(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef and p.prokind = 'f' and has_function_privilege($1, p.oid, 'execute')
        order by 1`,
      [role],
    );
    return [...new Set(r.rows.map((x) => x.proname as string))];
  };

  it("a visitor can run only the reviewed ones", async () => {
    const extra = (await open("anon")).filter((n) => !ANON_MAY_RUN.includes(n));
    expect(extra).toEqual([]);
  });

  it("a signed-in person can run only the reviewed ones", async () => {
    const extra = (await open("authenticated")).filter((n) => !SIGNED_IN_MAY_RUN.includes(n));
    expect(extra).toEqual([]);
  });

  it("every one pins its search path", async () => {
    const r = await run(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
        order by 1`,
    );
    expect(r.rows.map((x) => x.proname)).toEqual([]);
  });
});

describe("storage", () => {
  it("no policy lets a browser write to the buckets", async () => {
    const r = await run("select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') order by 1");
    expect(r.rows).toEqual([]);
  });

  it("a bank letter is recognised by its record, wherever the file is named", async () => {
    const fn = (await run("select pg_get_functiondef('public.document_is_bank_letter(text)'::regprocedure) as d")).rows[0].d as string;
    expect(fn).toMatch(/bank_confirmation/);
    expect((await run("select public.document_is_bank_letter('00000000-0000-0000-0000-000000000000/bank_confirmation-abc.pdf') as b")).rows[0].b).toBe(true);
    expect((await run("select public.document_is_bank_letter('00000000-0000-0000-0000-000000000000/logo-abc.png') as b")).rows[0].b).toBe(false);
  });
});

describe("new objects are closed to signed-in people by default", () => {
  it("default privileges no longer grant tables or functions to authenticated", async () => {
    const r = await run(
      `select d.defaclobjtype as kind, d.defaclacl::text as acl
         from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace join pg_roles o on o.oid = d.defaclrole
        where n.nspname = 'public' and o.rolname = 'postgres' and d.defaclobjtype in ('r', 'f', 'S')`,
    );
    for (const row of r.rows) expect(String(row.acl)).not.toMatch(/authenticated=/);
    for (const row of r.rows.filter((x) => x.kind === "S")) expect(String(row.acl)).not.toMatch(/anon=/);
  });
});
