import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Counts recent attempts per key and refuses once the limit is reached.
 * Used on checkout to slow down card testing (bots trying stolen cards).
 */
export async function hitRateLimit(bucket: string, keys: string[], limit: number, windowMinutes: number) {
  const db = createAdminClient();
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  for (const key of keys) {
    const { count, error } = await db
      .from("rate_limit_events")
      .select("id", { count: "exact", head: true })
      .eq("bucket", bucket)
      .eq("key", key)
      .gte("created_at", since);
    if (error) throw error;
    if ((count ?? 0) >= limit) return true;
  }
  const { error } = await db.from("rate_limit_events").insert(keys.map((key) => ({ bucket, key })));
  if (error) throw error;
  return false;
}
