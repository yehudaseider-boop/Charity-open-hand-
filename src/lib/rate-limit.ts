import "server-only";
import { createHash, createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The part of an internet address that stands for one visitor. A phone or home on IPv6 gets a whole /64 block and can
 * change the rest at will, so an IPv6 address counts by its first four groups; an IPv4 address (or one written as
 * "::ffff:1.2.3.4") counts as itself. Pure, exported for tests.
 */
export function addressForLimits(ip: string): string {
  const raw = ip.trim().replace(/%.*$/, "").replace(/^\[|\]$/g, "");
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(raw);
  if (mapped) return mapped[1];
  if (!raw.includes(":")) return raw;
  const [head, tail] = raw.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail === undefined ? [] : tail ? tail.split(":") : [];
  // A trailing IPv4 part ("…:1.2.3.4") takes two groups; it is past the /64 anyway.
  const width = (groups: string[]) => groups.reduce((n, g) => n + (g.includes(".") ? 2 : 1), 0);
  const groups = tail === undefined ? left : [...left, ...Array(Math.max(0, 8 - width(left) - width(right))).fill("0"), ...right];
  return `${groups.slice(0, 4).map((g) => (g.replace(/^0+(?=.)/, "") || "0")).join(":")}::/64`;
}

let warnedNoSecret = false;

/**
 * A one-way stand-in for an address or email in the limits table, so the table never holds the address itself
 * (POPIA: kept only as long as a limit needs it). Keyed with ENCRYPTION_KEY, so the stand-in can't be worked back by
 * trying every address. Without the key: a plain hash on a developer's machine, and no key at all on the live or test
 * site (null: that limit is skipped and the server log says so once), never an unkeyed hash of real addresses.
 */
export function hashedKey(kind: "ip" | "email", value: string): string | null {
  const secret = process.env.ENCRYPTION_KEY;
  const clean = kind === "email" ? value.trim().toLowerCase() : addressForLimits(value);
  if (!secret && process.env.NODE_ENV === "production") {
    if (!warnedNoSecret) {
      warnedNoSecret = true;
      console.error("[rate-limit] ENCRYPTION_KEY is not set: limits by internet address and by email stand-in are skipped");
    }
    return null;
  }
  const digest = secret
    ? createHmac("sha256", Buffer.from(secret, "base64")).update(`limit|${kind}|${clean}`).digest("base64url")
    : createHash("sha256").update(`limit|${kind}|${clean}`).digest("base64url");
  return `${kind}#${digest.slice(0, 32)}`;
}

/**
 * The rate-limit key for a visitor's address (hashed: see hashedKey). No address (the hosting header is missing)
 * gives no key, so everyone is not counted together under one "unknown" address; the other keys still apply.
 * Many donors share one address (a school hall, an office), so an address gets a wider allowance.
 */
export function ipKeys(ip: string): string[] {
  const key = ip && ip !== "unknown" ? hashedKey("ip", ip) : null;
  return key ? [key] : [];
}

/**
 * Counts recent attempts per key and refuses once the limit is reached.
 * Used on checkout to slow down card testing (bots trying stolen cards).
 */
export async function hitRateLimit(bucket: string, keys: string[], limit: number, windowMinutes: number) {
  if (keys.length === 0) return false;
  const db = createAdminClient();
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  // Record this attempt first, then count: parallel requests can't all slip under the limit.
  const { error } = await db.from("rate_limit_events").insert(keys.map((key) => ({ bucket, key })));
  if (error) throw error;
  // Each key is counted, and rows older than a day cleared, side by side rather than in turn (12/11/2026: speed).
  const [counts] = await Promise.all([
    Promise.all(
      keys.map(async (key) => {
        const { count, error: countError } = await db
          .from("rate_limit_events")
          .select("id", { count: "exact", head: true })
          .eq("bucket", bucket)
          .eq("key", key)
          .gte("created_at", since);
        if (countError) throw countError;
        return count ?? 0;
      }),
    ),
    // Emails and address stand-ins here are kept for about a day (Privacy Policy).
    db.from("rate_limit_events").delete().lt("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString()),
  ]);
  return counts.some((count) => count > limit);
}

/**
 * Whether these keys already used up their allowance, without counting this attempt. For limits that count only
 * presses that did something (an email actually tried): check with this first, then count with hitRateLimit after.
 */
export async function rateLimitReached(bucket: string, keys: string[], limit: number, windowMinutes: number): Promise<boolean> {
  if (keys.length === 0) return false;
  const db = createAdminClient();
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const counts = await Promise.all(
    keys.map(async (key) => {
      const { count, error } = await db.from("rate_limit_events").select("id", { count: "exact", head: true }).eq("bucket", bucket).eq("key", key).gte("created_at", since);
      if (error) throw error;
      return count ?? 0;
    }),
  );
  return counts.some((count) => count >= limit);
}

/**
 * Count this attempt first (so parallel requests can't all slip under the limit), and hand back the rows written,
 * so an attempt that turns out fine can be taken back with forgetAttempts (sign-in codes: only wrong ones count,
 * review 12/11/2026). Limited when any key is over its allowance, this attempt included.
 */
export async function takeAttempt(bucket: string, keys: string[], limit: number, windowMinutes: number): Promise<{ limited: boolean; ids: string[] }> {
  if (keys.length === 0) return { limited: false, ids: [] };
  const db = createAdminClient();
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const { data, error } = await db.from("rate_limit_events").insert(keys.map((key) => ({ bucket, key }))).select("id");
  if (error) throw error;
  const ids = (data ?? []).map((r) => String(r.id));
  for (const key of keys) {
    const { count, error: countError } = await db.from("rate_limit_events").select("id", { count: "exact", head: true }).eq("bucket", bucket).eq("key", key).gte("created_at", since);
    if (countError) throw countError;
    if ((count ?? 0) > limit) return { limited: true, ids };
  }
  return { limited: false, ids };
}

/** Take back attempts counted with takeAttempt (a right code). Never throws: an attempt left counted only costs a try. */
export async function forgetAttempts(ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    const { error } = await createAdminClient().from("rate_limit_events").delete().in("id", ids);
    if (error) console.error(`[rate-limit] could not take back attempts: ${error.message}`);
  } catch (e) {
    console.error("[rate-limit] could not take back attempts", e);
  }
}
