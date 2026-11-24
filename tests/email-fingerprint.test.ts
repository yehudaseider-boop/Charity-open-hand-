/**
 * Keyed email fingerprints (Yehuda, 24/11/2026). The fingerprint needs the server's key; the converter turns every
 * plain hash into the keyed one, in pages, safely twice; an opt-out made before the change is honoured before and
 * after conversion; and no code path hashes an address any other way. The database half (the conversion function's
 * merges and access) is in email-fingerprints-db.test.ts.
 */
import { createHash, createHmac, hkdfSync } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");
/** The plain hash stored before 24/11/2026, worked out here the way it was. */
const plain = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

// The tables, in memory. Reads give at most 1 000 rows, as the database's API does.
type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
let reads: { table: string; rows: number }[] = [];
let rpcCalls = 0;
/** What user_email_addresses() gives for the signed-in person (the database already trims and lower-cases them). */
let addresses: string[] = [];
const CAP = 1000;

/** The database's convert_email_fingerprints(), as the migration writes it (the parts these tests reach). */
function convertRpc(args: { p_table: string; p_old: string[]; p_new: string[] }): number {
  rpcCalls++;
  const rows = tables[args.p_table] ?? [];
  const twinKey: Record<string, string | null> = { thank_you_opt_outs: null, charity_email_opt_outs: "charity_id", charity_thank_you_recipients: "thank_you_id", email_stop_tokens: "token_hash", charity_email_stop_tokens: "token_hash" };
  const by = twinKey[args.p_table];
  let n = 0;
  args.p_old.forEach((o, i) => {
    const k = args.p_new[i];
    for (const r of [...rows]) {
      if (r.email_hash !== o || r.email_hash_v !== 1) continue;
      const twin = by === "token_hash" ? undefined : rows.find((t) => t.email_hash === k && (by === null || t[by] === r[by]));
      if (twin) {
        if (twin.source === "checkout" && r.source) twin.source = r.source;
        rows.splice(rows.indexOf(r), 1);
      } else {
        r.email_hash = k;
        r.email_hash_v = 2;
      }
      n++;
    }
  });
  return n;
}

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let order: string | null = null;
  let limit = CAP;
  let head = false;
  let cols = "*";
  const pick = (r: Row) => (cols === "*" ? { ...r } : Object.fromEntries(cols.split(",").map((c) => c.trim()).map((c) => [c, r[c]])));
  const result = () => {
    let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    if (order) rows = [...rows].sort((a, b) => String(a[order!]).localeCompare(String(b[order!])));
    const count = rows.length;
    rows = rows.slice(0, Math.min(limit, CAP));
    reads.push({ table, rows: rows.length });
    return head ? { data: null, count, error: null } : { data: rows.map(pick), count, error: null };
  };
  const b = {
    select(c = "*", opts: { head?: boolean } = {}) {
      cols = c;
      head = Boolean(opts.head);
      return b;
    },
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), b),
    gt: (c: string, v: string) => (filters.push((r) => String(r[c]) > v), b),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
    order: (c: string) => ((order = c), b),
    limit: (n: number) => ((limit = n), b),
    maybeSingle: async () => ({ data: result().data?.[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad),
    upsert: (row: Row, opts: { onConflict: string; ignoreDuplicates?: boolean }) => {
      const keys = opts.onConflict.split(",");
      const list = (tables[table] ??= []);
      const had = list.find((r) => keys.every((k) => r[k] === row[k]));
      if (!had) list.push({ ...row });
      else if (!opts.ignoreDuplicates) Object.assign(had, row);
      return Promise.resolve({ error: null });
    },
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: query,
    rpc: async (name: string, args: { p_table: string; p_old: string[]; p_new: string[] }) =>
      name === "convert_email_fingerprints"
        ? { data: convertRpc(args), error: null }
        : name === "user_email_addresses"
          ? { data: addresses, error: null }
          : { data: null, error: { message: `no ${name}` } },
  }),
}));

const { emailHash, emailHashesToMatch, keyLegacyHash, keyedFromStored, storedEmailHash } = await import("@/lib/email-fingerprint");
const { convertEmailFingerprints } = await import("@/lib/email-fingerprint-convert");
const { optedOut, stopThankYous } = await import("@/lib/charity/thank-you-send");
const { optedOutHashes } = await import("@/lib/charity/s18a-reminder-send");
const { newsOptOutsFor } = await import("@/lib/charity/news-opt-outs");

beforeEach(() => {
  vi.stubEnv("ENCRYPTION_KEY", KEY_A);
  tables = { thank_you_opt_outs: [], email_stop_tokens: [], charity_email_opt_outs: [], charity_email_stop_tokens: [], charity_thank_you_recipients: [] };
  reads = [];
  rpcCalls = 0;
});

describe("the email fingerprint", () => {
  it("is keyed: another key gives another fingerprint, and it is never the plain hash", () => {
    const a = emailHash("sarah@x.co");
    vi.stubEnv("ENCRYPTION_KEY", KEY_B);
    const b = emailHash("sarah@x.co");
    expect(a).not.toBe(b);
    expect(a).not.toBe(plain("sarah@x.co"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is HMAC-SHA256 of the plain hash, with a key derived from ENCRYPTION_KEY", () => {
    const key = Buffer.from(hkdfSync("sha256", Buffer.from(KEY_A, "base64"), Buffer.alloc(0), "givezy email fingerprint v1", 32));
    expect(emailHash("sarah@x.co")).toBe(createHmac("sha256", key).update(plain("sarah@x.co")).digest("hex"));
    expect(keyLegacyHash(plain("sarah@x.co"))).toBe(emailHash("sarah@x.co"));
  });

  it("is the same whatever the case and the spaces around the address", () => {
    expect(emailHash("  Sarah@X.co ")).toBe(emailHash("sarah@x.co"));
    expect(emailHashesToMatch(["Sarah@X.co ", "sarah@x.co"])).toEqual([emailHash("sarah@x.co"), plain("sarah@x.co")]);
  });

  it("refuses to work without the key, never falling back to the plain hash", () => {
    vi.stubEnv("ENCRYPTION_KEY", "");
    expect(() => emailHash("sarah@x.co")).toThrow(/Missing ENCRYPTION_KEY/);
    expect(() => emailHashesToMatch(["sarah@x.co"])).toThrow(/Missing ENCRYPTION_KEY/);
    vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(16, 1).toString("base64"));
    expect(() => emailHash("sarah@x.co")).toThrow(/32 bytes/);
  });

  it("is written at version 2, and a stored plain hash reads as the keyed one", () => {
    expect(storedEmailHash("sarah@x.co")).toEqual({ email_hash: emailHash("sarah@x.co"), email_hash_v: 2 });
    expect(keyedFromStored(plain("sarah@x.co"), 1)).toBe(emailHash("sarah@x.co"));
    expect(keyedFromStored(emailHash("sarah@x.co"), 2)).toBe(emailHash("sarah@x.co"));
  });
});

describe("converting stored plain hashes", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => `donor${i}@x.co`);

  it("converts every row, more than 1 000, reading at most 1 000 at a time", async () => {
    tables.thank_you_opt_outs = many(2500).map((e) => ({ email_hash: plain(e), email_hash_v: 1 }));
    tables.charity_email_opt_outs = many(1200).map((e) => ({ charity_id: "c1", email_hash: plain(e), email_hash_v: 1, source: "checkout" }));
    const r = await convertEmailFingerprints(Date.now() + 60_000);
    expect(r.cutOff).toBe(false);
    expect(r.converted).toBe(3700);
    expect(Object.values(r.left!)).toEqual([0, 0, 0, 0, 0]);
    expect(Math.max(...reads.map((x) => x.rows))).toBeLessThanOrEqual(CAP);
    expect(tables.thank_you_opt_outs.every((x) => x.email_hash_v === 2)).toBe(true);
    expect(new Set(tables.thank_you_opt_outs.map((x) => x.email_hash))).toEqual(new Set(many(2500).map((e) => emailHash(e))));
  });

  it("is safe to run twice: the second run changes nothing", async () => {
    tables.email_stop_tokens = many(30).map((e, i) => ({ token_hash: String(i).padStart(64, "0"), email_hash: plain(e), email_hash_v: 1 }));
    await convertEmailFingerprints(Date.now() + 60_000);
    const after = JSON.stringify(tables);
    rpcCalls = 0;
    const again = await convertEmailFingerprints(Date.now() + 60_000);
    expect(again.converted).toBe(0);
    expect(rpcCalls).toBe(0);
    expect(JSON.stringify(tables)).toBe(after);
  });

  it("hands rows to the database 50 at a time, so one call stays well inside the job's few seconds (review 24/11/2026)", async () => {
    tables.thank_you_opt_outs = many(120).map((e) => ({ email_hash: plain(e), email_hash_v: 1 }));
    const r = await convertEmailFingerprints(Date.now() + 60_000);
    expect(r.converted).toBe(120);
    expect(rpcCalls).toBe(3);
  });

  it("never touches a row already keyed (it would be keyed twice)", async () => {
    tables.thank_you_opt_outs = [{ email_hash: emailHash("new@x.co"), email_hash_v: 2 }];
    await convertEmailFingerprints(Date.now() + 60_000);
    expect(tables.thank_you_opt_outs).toEqual([{ email_hash: emailHash("new@x.co"), email_hash_v: 2 }]);
  });

  it("stops at its time limit and carries on next time", async () => {
    tables.thank_you_opt_outs = many(10).map((e) => ({ email_hash: plain(e), email_hash_v: 1 }));
    const first = await convertEmailFingerprints(Date.now() - 1);
    expect(first.cutOff).toBe(true);
    // Cut off: no time to count every table, so no counts (review 24/11/2026).
    expect(first.left).toBeNull();
    expect(reads.some((r) => r.table === "thank_you_opt_outs")).toBe(false);
    const next = await convertEmailFingerprints(Date.now() + 60_000);
    expect(next.left?.thank_you_opt_outs).toBe(0);
  });
});

describe("an opt-out made before the change", () => {
  it("is honoured before conversion, after it, and when the same person opts out again in between", async () => {
    tables.thank_you_opt_outs = [{ email_hash: plain("sarah@x.co"), email_hash_v: 1 }];
    tables.charity_email_opt_outs = [{ charity_id: "c1", email_hash: plain("david@x.co"), email_hash_v: 1, source: "stop_link" }];
    const check = async () => {
      expect(await optedOut([" Sarah@x.co", "david@x.co", "ann@x.co"], "c1")).toEqual(new Set(["sarah@x.co", "david@x.co"]));
      const forReminder = await optedOutHashes("c1", ["sarah@x.co", "david@x.co", "ann@x.co"], { forDetailsReminder: true });
      expect(forReminder).toEqual(new Set([emailHash("sarah@x.co"), emailHash("david@x.co")]));
    };
    await check();
    // David ticks "No news" again at a checkout after the change (keyed); the converter keeps the stronger stop link.
    tables.charity_email_opt_outs.push({ charity_id: "c1", ...storedEmailHash("david@x.co"), source: "checkout" });
    await convertEmailFingerprints(Date.now() + 60_000);
    expect(tables.charity_email_opt_outs).toEqual([{ charity_id: "c1", email_hash: emailHash("david@x.co"), email_hash_v: 2, source: "stop_link" }]);
    await check();
  });

  it("a stop link sent before the change saves the keyed fingerprint, never the plain hash", async () => {
    const token = "t".repeat(43);
    tables.email_stop_tokens = [{ token_hash: createHash("sha256").update(token).digest("hex"), email_hash: plain("sarah@x.co"), email_hash_v: 1 }];
    expect(await stopThankYous(token)).toBe(true);
    expect(tables.thank_you_opt_outs).toEqual([{ email_hash: emailHash("sarah@x.co"), email_hash_v: 2 }]);
    expect(await optedOut(["sarah@x.co"])).toEqual(new Set(["sarah@x.co"]));
  });
});

describe("the app's news opt-outs, worked out by the server", () => {
  it("finds the charities under any of the person's addresses, before and after conversion", async () => {
    addresses = ["donor@x.co", "work@x.co"];
    tables.charity_email_opt_outs = [
      { charity_id: "c1", email_hash: plain("work@x.co"), email_hash_v: 1, source: "checkout" },
      { charity_id: "c2", ...storedEmailHash("donor@x.co"), source: "stop_link" },
      { charity_id: "c3", ...storedEmailHash("someone.else@x.co"), source: "checkout" },
    ];
    expect((await newsOptOutsFor("u1")).sort()).toEqual(["c1", "c2"]);
    await convertEmailFingerprints(Date.now() + 60_000);
    expect((await newsOptOutsFor("u1")).sort()).toEqual(["c1", "c2"]);
    addresses = [];
    expect(await newsOptOutsFor("u1")).toEqual([]);
  });
});

describe("no other way to fingerprint an address", () => {
  const root = path.resolve(import.meta.dirname, "../src");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name)) files.push(p);
    }
  };
  walk(root);
  const rel = (p: string) => path.relative(root, p);
  const MODULE = "lib/email-fingerprint.ts";
  // Rate-limit keys outside production only (no key there): short-lived counters, never stored fingerprints.
  const ALLOWED_PLAIN = ["lib/rate-limit.ts"];

  it("only the fingerprint module hashes an address with node:crypto", () => {
    const found: string[] = [];
    for (const f of files) {
      if (rel(f) === MODULE || ALLOWED_PLAIN.includes(rel(f))) continue;
      const text = readFileSync(f, "utf8");
      text.split("\n").forEach((line, i) => {
        if (/createHash\(/.test(line) && /email/i.test(line)) found.push(`${rel(f)}:${i + 1}`);
        if (/\bsha\([^)]*email/i.test(line)) found.push(`${rel(f)}:${i + 1}`);
      });
      if (/export function emailHash\b/.test(text)) found.push(`${rel(f)}: defines emailHash`);
    }
    expect(found).toEqual([]);
  });

  it("every fingerprint written says it is keyed, and every one read says which kind it is", () => {
    const found: string[] = [];
    for (const f of files) {
      if (rel(f) === MODULE || rel(f) === "lib/email-fingerprint-convert.ts") continue;
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          // A write names the column: it must say version 2 (or spread storedEmailHash, which does).
          if (/\bemail_hash:/.test(line) && !/email_hash_v: EMAIL_HASH_VERSION/.test(line)) found.push(`${rel(f)}:${i + 1} writes email_hash without its version`);
          // A read of the column must read the version too, so a plain hash is never taken for a keyed one.
          for (const m of line.matchAll(/\.select\("([^"]*)"/g)) {
            if (/\bemail_hash\b/.test(m[1]) && !/\bemail_hash_v\b/.test(m[1])) found.push(`${rel(f)}:${i + 1} reads email_hash without email_hash_v`);
          }
        });
    }
    expect(found).toEqual([]);
  });
});
