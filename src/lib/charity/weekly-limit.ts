import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailHash, weekStart } from "./thank-you";

export { WEEKLY_LIMIT } from "./weekly-limit-rule";

const db = () => createAdminClient();

/**
 * Donors who already had a message from this charity this week (Monday, Johannesburg): a personal thank-you or an
 * s18A reminder (the weekly claim), a news email or appeal, or the monthly thank-you. One message a week, decided
 * 09/11/2026, applied by every sender. `except` leaves out the send that is asking (an appeal or monthly thank-you
 * already claims its own recipients). Service role: call only after checking the person manages this charity.
 *
 * The limit is per inbox, not per donor record (20/11/2026): someone who gave as themselves and as their company has
 * two donor records with one address, and a message to either counts for both. Thank-yous, reminders and appeals are
 * kept by donor record, so the other records with the same address are found first and checked with them.
 */
export async function messagedThisWeek(
  charityId: string,
  donors: { donorId: string; hash: string }[],
  now = new Date(),
  except: { appealId?: string; thankYouId?: string } = {},
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!donors.length) return out;
  const week = weekStart(now);
  const since = `${week}T00:00:00+02:00`;
  // The donors asked about, by address (kept as a hash).
  const byHash = new Map<string, Set<string>>();
  const own = (hash: string, donorId: string) => byHash.set(hash, (byHash.get(hash) ?? new Set()).add(donorId));
  for (const d of donors) own(d.hash, d.donorId);
  const asked = new Set(donors.map((d) => d.donorId));
  // Every donor record with one of their addresses, and the address it has: theirs, and their other records.
  const hashOf = await sameInbox([...asked]);
  for (const [id, hash] of hashOf) if (asked.has(id)) own(hash, id);
  const ids = [...new Set([...asked, ...hashOf.keys()])];
  const reached = (donorId: string) => {
    if (asked.has(donorId)) out.add(donorId);
    const hash = hashOf.get(donorId);
    for (const id of (hash && byHash.get(hash)) || []) out.add(id);
  };
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    let appealQuery = db().from("charity_appeal_recipients").select("donor_id").eq("charity_id", charityId).in("status", ["sending", "sent"]).gte("claimed_at", since).in("donor_id", chunk);
    if (except.appealId) appealQuery = appealQuery.neq("appeal_id", except.appealId);
    const [claims, appeals] = await Promise.all([
      db().from("charity_donor_thanks").select("donor_id").eq("charity_id", charityId).eq("week_start", week).in("donor_id", chunk),
      // 'sending' may have gone, so it counts; 'failed' and 'skipped' didn't.
      appealQuery,
    ]);
    if (claims.error) throw claims.error;
    if (appeals.error) throw appeals.error;
    for (const r of [...(claims.data ?? []), ...(appeals.data ?? [])]) reached(r.donor_id as string);
  }
  // The monthly thank-you goes by address (kept as a hash). Only thank-yous started in the last two months can have
  // reached anyone this week.
  const { data: months, error } = await db().from("charity_thank_yous").select("id").eq("charity_id", charityId).gte("sent_at", new Date(new Date(since).getTime() - 62 * 86_400_000).toISOString());
  if (error) throw error;
  const monthIds = (months ?? []).map((m) => m.id as string).filter((id) => id !== except.thankYouId);
  const hashes = [...byHash.keys()];
  if (monthIds.length) {
    for (let i = 0; i < hashes.length; i += 200) {
      const { data, error: e } = await db().from("charity_thank_you_recipients").select("email_hash").in("thank_you_id", monthIds).in("email_hash", hashes.slice(i, i + 200)).neq("status", "failed").gte("claimed_at", since);
      if (e) throw e;
      for (const r of data ?? []) for (const id of byHash.get(r.email_hash as string) ?? []) out.add(id);
    }
  }
  return out;
}

/**
 * Donor record id to the hash of its address, for these donor records and every other record with one of their
 * addresses (the address column ignores case). Two reads per 200 donors, never one per donor.
 */
async function sameInbox(donorIds: string[]): Promise<Map<string, string>> {
  const hashOf = new Map<string, string>();
  const addresses = new Set<string>();
  for (let i = 0; i < donorIds.length; i += 200) {
    const { data, error } = await db().from("donors").select("id, email").in("id", donorIds.slice(i, i + 200));
    if (error) throw error;
    for (const r of data ?? []) {
      if (typeof r.email !== "string" || !r.email.trim()) continue;
      hashOf.set(r.id as string, emailHash(r.email));
      addresses.add(r.email.trim().toLowerCase());
    }
  }
  const list = [...addresses];
  // Addresses are longer than ids: fewer per read keeps the request short.
  for (let i = 0; i < list.length; i += 100) {
    const { data, error } = await db().from("donors").select("id, email").in("email", list.slice(i, i + 100));
    if (error) throw error;
    for (const r of data ?? []) if (typeof r.email === "string" && r.email.trim()) hashOf.set(r.id as string, emailHash(r.email));
  }
  return hashOf;
}
