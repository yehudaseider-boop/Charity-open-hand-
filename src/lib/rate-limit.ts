import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The rate-limit key for a visitor's address. No address (the hosting header is missing) gives no key,
 * so everyone is not counted together under one "unknown" address; the other keys still apply.
 * Many donors share one address (a school hall, an office), so an address gets a wider allowance.
 */
export function ipKeys(ip: string): string[] {
  return ip && ip !== "unknown" ? [`ip:${ip}`] : [];
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
  for (const key of keys) {
    const { count, error: countError } = await db
      .from("rate_limit_events")
      .select("id", { count: "exact", head: true })
      .eq("bucket", bucket)
      .eq("key", key)
      .gte("created_at", since);
    if (countError) throw countError;
    if ((count ?? 0) > limit) return true;
  }
  // IP addresses and emails here are kept for about a day (Privacy Policy).
  await db.from("rate_limit_events").delete().lt("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString());
  return false;
}
