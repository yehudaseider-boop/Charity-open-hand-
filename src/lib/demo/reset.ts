import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import { legalConfig } from "@/config/legal";
import { encrypt, receiptIdentity } from "@/lib/crypto";
import { isoDateInJhb } from "@/lib/dates";
import { runReceiptsJob } from "@/lib/receipts/issue";
import { planReceipts } from "@/lib/receipts/plan";
import { fingerprintPlan } from "@/lib/receipts/runs";
import { supabaseReceiptStore } from "@/lib/receipts/store";
import { buildDemoData, type DemoUsers, type Row } from "./data";
import { DEMO_PEOPLE, demoModeOn } from "./mode";
import { totpCode } from "./totp";

/**
 * Puts the demo back as new: wipes the demo database and loads the made-up data again. Used by the
 * nightly job (/api/jobs/demo-reset) and by `npm run demo:reset`.
 *
 * Refuses unless all of these hold, checked before anything is deleted:
 *  - demo mode is on (DEMO_MODE=yes, test gateway, no real gateway or email key);
 *  - DEMO_DATABASE_URL is set and points at the same Supabase project as NEXT_PUBLIC_SUPABASE_URL;
 *  - the database is the demo's own: it holds the demo owner's account marked as a demo account,
 *    or it is empty (the first load);
 *  - no charity in it uses a real gateway.
 */

export class DemoResetRefused extends Error {}

/** The Supabase project ref in a URL ("abcd" in https://abcd.supabase.co, or postgres.abcd@...pooler...). */
export function projectRef(url: string): string | null {
  const m = /(?:\/\/|\.|postgres\.)([a-z0-9]{20})(?:\.supabase\.co|[:@])/.exec(url);
  return m ? m[1] : null;
}

/** Same project, or both on this machine (local development). */
export function sameDemoProject(apiUrl: string, databaseUrl: string): boolean {
  const local = (u: string) => /\/\/(?:[^@/]*@)?(127\.0\.0\.1|localhost)[:/]/.test(u);
  if (local(apiUrl) && local(databaseUrl)) return true;
  const a = projectRef(apiUrl);
  return a !== null && a === projectRef(databaseUrl);
}

const OWNER = DEMO_PEOPLE.find((p) => p.key === "owner")!.email;

async function checkSafeToWipe(c: pg.Client) {
  const { rows: [counts] } = await c.query<{ charities: string; users: string; owner: string; real_gateway: string }>(`
    select
      (select count(*) from public.charities) as charities,
      (select count(*) from auth.users) as users,
      (select count(*) from auth.users where email = $1 and raw_app_meta_data ->> 'demo' = 'true') as owner,
      (select count(*) from public.charities where gateway is not null and gateway <> 'test') as real_gateway`, [OWNER]);
  if (Number(counts.real_gateway) > 0) throw new DemoResetRefused("A charity in this database uses a real payment gateway. This is not the demo database.");
  const empty = Number(counts.charities) === 0 && Number(counts.users) === 0;
  if (!empty && Number(counts.owner) !== 1) throw new DemoResetRefused("This database has data but is not marked as the demo database. Nothing was deleted.");
}

async function wipe(c: pg.Client, admin: SupabaseClient) {
  // Truncate skips the row triggers that keep receipts and the audit log unchangeable on the real site.
  const { rows } = await c.query<{ t: string }>(`select format('%I.%I', schemaname, tablename) as t from pg_tables where schemaname = 'public'`);
  await c.query(`truncate ${rows.map((r) => r.t).join(", ")} restart identity cascade`);
  await c.query(`delete from storage.objects where bucket_id in ('receipts', 'charity-public', 'charity-documents')`).catch(() => undefined);
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
    if (error) throw error;
    if (!data.users.length) break;
    for (const u of data.users) {
      const { error: e } = await admin.auth.admin.deleteUser(u.id);
      if (e) throw e;
    }
  }
}

/** The four people, each marked as a demo account. Admins get an authenticator app (its secret kept encrypted). */
async function createPeople(admin: SupabaseClient, apiUrl: string, publishableKey: string): Promise<DemoUsers> {
  const out: Partial<DemoUsers> = {};
  for (const p of DEMO_PEOPLE) {
    const { data, error } = await admin.auth.admin.createUser({ email: p.email, email_confirm: true, app_metadata: { demo: true } });
    if (error) throw error;
    out[p.key] = data.user.id;
    if (!p.secondStep) continue;
    // Sign in as them once (a server-made token, no email) to set up the authenticator.
    const { data: link, error: le } = await admin.auth.admin.generateLink({ type: "magiclink", email: p.email });
    if (le || !link.properties?.hashed_token) throw le ?? new Error("No sign-in token");
    const session = createClient(apiUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: ve } = await session.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
    if (ve) throw ve;
    const { data: factor, error: fe } = await session.auth.mfa.enroll({ factorType: "totp", friendlyName: "Demo authenticator" });
    if (fe || !factor) throw fe ?? new Error("Could not set up the authenticator");
    const { error: ce } = await session.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totpCode(factor.totp.secret) });
    if (ce) throw ce;
    const { error: ue } = await admin.auth.admin.updateUserById(data.user.id, { app_metadata: { demo: true, demo_totp: encrypt(factor.totp.secret) } });
    if (ue) throw ue;
    await session.auth.signOut();
  }
  const { data: avi, error: ae } = await admin.auth.admin.createUser({ email: "avi.torah@givezy-demo.test", email_confirm: true, app_metadata: { demo: true } });
  if (ae) throw ae;
  out.torahOwner = avi.user.id;
  return out as DemoUsers;
}

async function insert(c: pg.Client, table: string, rows: Row[]) {
  if (!rows.length) return;
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const per = Math.max(1, Math.floor(30_000 / cols.length));
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per);
    const values: unknown[] = [];
    const tuples = chunk.map((r) => `(${cols.map((col) => {
      const v = r[col];
      // A column this row leaves out keeps the table's default (another row in the batch may set it).
      if (v === undefined) return "default";
      values.push(v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) ? JSON.stringify(v) : v);
      return `$${values.length}`;
    }).join(", ")})`);
    await c.query(`insert into public.${table} (${cols.map((x) => `"${x}"`).join(", ")}) values ${tuples.join(", ")}`, values);
  }
}

async function update(c: pg.Client, table: string, rows: Row[]) {
  for (const { id, ...rest } of rows) {
    const cols = Object.keys(rest);
    await c.query(`update public.${table} set ${cols.map((x, i) => `"${x}" = $${i + 2}`).join(", ")} where id = $1`, [id, ...cols.map((x) => rest[x])]);
  }
}

export type DemoResetSummary = { donors: number; donations: number; receipts: number; tookMs: number };

export async function resetDemo(env: Record<string, string | undefined> = process.env, now = new Date()): Promise<DemoResetSummary> {
  const started = Date.now();
  if (!demoModeOn(env)) throw new DemoResetRefused("Demo mode is off. Nothing was deleted.");
  const apiUrl = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SECRET_KEY, publishable = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, dbUrl = env.DEMO_DATABASE_URL;
  if (!apiUrl || !key || !publishable || !dbUrl) throw new DemoResetRefused("Missing NEXT_PUBLIC_SUPABASE_URL, the Supabase keys or DEMO_DATABASE_URL. Nothing was deleted.");
  if (!sameDemoProject(apiUrl, dbUrl)) throw new DemoResetRefused("DEMO_DATABASE_URL is not the same Supabase project as the site. Nothing was deleted.");

  const admin = createClient(apiUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const c = new pg.Client({ connectionString: dbUrl, ssl: /127\.0\.0\.1|localhost/.test(dbUrl) ? false : { rejectUnauthorized: false } });
  await c.connect();
  try {
    await checkSafeToWipe(c);
    await wipe(c, admin);
    const users = await createPeople(admin, apiUrl, publishable);
    const data = buildDemoData({
      now,
      users,
      encrypt,
      identity: (v) => receiptIdentity(v),
      policyVersion: legalConfig.policyVersion,
    });
    await c.query("begin");
    try {
      for (const [table, rows] of data.tables) await insert(c, table, rows);
      for (const [table, rows] of data.updates) await update(c, table, rows);
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      throw e;
    }

    // Last tax year's s18A receipts for Meals, issued the same way the real sign-off does (without PDFs:
    // the demo shows each receipt as a page). Torah's list is approved and waits for Givezy's sign-off.
    const store = supabaseReceiptStore(admin);
    const planFor = async (charityId: string) =>
      planReceipts({ taxYear: data.lastClosedTaxYear, donations: await store.listDonations(data.lastClosedTaxYear, charityId), charities: await store.listCharities([charityId]), alreadyReceipted: new Set() }).receipts;
    const run = (charityId: string, receipts: Awaited<ReturnType<typeof planFor>>, approvedBy: string) => ({
      charity_id: charityId, tax_year: data.lastClosedTaxYear, plan_fingerprint: fingerprintPlan(receipts), receipts_planned: receipts.length,
      total_cents: receipts.reduce((s, x) => s + x.totalCents, 0), charity_approved_by: approvedBy, charity_approved_at: now.toISOString(),
    });
    const mealsPlan = await planFor(data.meals);
    const summary = await runReceiptsJob({
      store: { ...store, savePdf: async () => {}, listIssuedWithoutPdf: async () => [] },
      render: async () => Buffer.alloc(0),
      taxYear: data.lastClosedTaxYear,
      today: isoDateInJhb(now),
      now,
      mode: "issue",
      charityId: data.meals,
    });
    // Shown as a finished run: in the demo "made" and "emailed" mean shown as a page and noted (nothing is sent).
    await insert(c, "receipt_runs", [{
      ...run(data.meals, mealsPlan, users.owner), status: "done", signed_off_by: users.givezy, signed_off_at: now.toISOString(), finished_at: now.toISOString(),
      summary: { ...summary, pdfsMade: summary.issued, emailed: summary.issued },
    }]);
    const torahPlan = await planFor(data.torah);
    if (torahPlan.length) await insert(c, "receipt_runs", [{ ...run(data.torah, torahPlan, users.torahOwner), status: "charity_approved" }]);
    const donations = data.tables.find(([t]) => t === "donations")![1].length;
    const donors = data.tables.find(([t]) => t === "donors")![1].length;
    return { donors, donations, receipts: summary.issued, tookMs: Date.now() - started };
  } finally {
    await c.end();
  }
}
