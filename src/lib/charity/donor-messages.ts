import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A charity's thank-you inside the Givezy app (24/11/2026, Yehuda: "donors get the thank-you by email AND see it inside
 * the Givezy app, a message in the app, no phone push notification"). Written only here, by the server, after the
 * email to that donor went (src/lib/charity/appeals.ts, sendAppeal), so whoever said no to the charity's emails, or
 * was left out by the weekly or monthly limits or the one-per-inbox rule, gets neither. Only for donor records linked
 * to an app account (donors.user_id); everyone else just gets the email.
 *
 * The table (donor_messages, migration 20261124000013_givy_thank_yous.sql) comes later than this code: until it is there, nothing is
 * written and nothing fails (the email has already gone either way).
 */

/** The table isn't there yet (before the migration), so there is nothing to write or read. */
export const isMissingTable = (e: { code?: string } | null | undefined) => e?.code === "PGRST205" || e?.code === "42P01";

export type InAppMessageRow = { charity_id: string; user_id: string; donor_id: string; appeal_id: string; subject: string; body: string };

/** One row per app account (two donor records linked to one account get it once). Pure, for the tests. */
export function inAppRows(args: { charityId: string; appealId: string; subject: string; body: string }, linked: { id: string; user_id: string | null }[]): InAppMessageRow[] {
  const seen = new Set<string>();
  const rows: InAppMessageRow[] = [];
  for (const d of linked) {
    if (!d.user_id || seen.has(d.user_id)) continue;
    seen.add(d.user_id);
    rows.push({ charity_id: args.charityId, user_id: d.user_id, donor_id: d.id, appeal_id: args.appealId, subject: args.subject, body: args.body });
  }
  return rows;
}

/**
 * Writes the in-app copy for these donors (whose email just went). Returns how many were written. Never throws: a
 * missing table or a failed write is logged (counts only) and the send carries on.
 */
export async function writeInAppMessages(args: { charityId: string; appealId: string; subject: string; body: string; donorIds: string[] }): Promise<number> {
  if (!args.donorIds.length) return 0;
  try {
    const db = createAdminClient();
    const { data, error } = await db.from("donors").select("id, user_id").in("id", args.donorIds).not("user_id", "is", null);
    if (error) throw error;
    const rows = inAppRows(args, (data ?? []) as { id: string; user_id: string | null }[]);
    if (!rows.length) return 0;
    // Pressing "Send the rest" never adds a second copy: one per email and app account.
    const saved = await db.from("donor_messages").upsert(rows, { onConflict: "appeal_id,user_id", ignoreDuplicates: true });
    if (saved.error) {
      if (isMissingTable(saved.error)) return 0;
      throw saved.error;
    }
    return rows.length;
  } catch (e) {
    console.error("[donor-messages] in-app copy not written", e instanceof Error ? e.message : e);
    return 0;
  }
}
