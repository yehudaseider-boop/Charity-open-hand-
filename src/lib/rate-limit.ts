import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Counts recent attempts per key and refuses once the limit is reached.
 * Used on checkout to slow down card testing (bots trying stolen cards).
 */
export async function hitRateLimit(bucket: string, keys: string[], limit: number, windowMinutes: number) {
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
