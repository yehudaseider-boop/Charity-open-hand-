import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailHashesToMatch } from "@/lib/email-fingerprint";

/**
 * The charities whose news and appeals this signed-in person turned off, under any address they have used with us:
 * their sign-in address, the address on their donor records, and every address typed at their checkouts. Opt-outs
 * keep only a keyed fingerprint of the address, which the database can't work out (24/11/2026), so the database hands
 * the server the person's own addresses (user_email_addresses) and the server looks the fingerprints up. Each address
 * is looked up keyed and, until every row is converted, by its plain hash, so an opt-out made before the change counts.
 *
 * Call only for the person who is signed in, after checking their session (never a password session): it reads with
 * the service role. Only charity ids leave this file.
 */
export async function newsOptOutsFor(userId: string): Promise<string[]> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("user_email_addresses", { p_user_id: userId });
  if (error) throw new Error(error.message);
  const addresses = ((data ?? []) as unknown[]).filter((e): e is string => typeof e === "string" && e.trim() !== "");
  const out = new Set<string>();
  for (let i = 0; i < addresses.length; i += 100) {
    const { data: rows, error: e } = await db.from("charity_email_opt_outs").select("charity_id").in("email_hash", emailHashesToMatch(addresses.slice(i, i + 100)));
    if (e) throw new Error(e.message);
    for (const r of rows ?? []) out.add(r.charity_id as string);
  }
  return [...out];
}
