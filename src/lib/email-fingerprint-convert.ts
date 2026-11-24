import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { keyLegacyHash } from "./email-fingerprint";

/**
 * Turns every email fingerprint still stored at version 1 (the plain hash, before 24/11/2026) into version 2 (keyed).
 * It needs the key, so it runs on the server: rows at version 1 are read in order of their value, 1 000 at a time (the
 * most the database gives in one read), their values keyed here, and handed to convert_email_fingerprints() in
 * batches of 200, which changes only rows still at version 1 and merges a row whose keyed twin is already there.
 * Safe to run twice, or at the same time as itself: a row already converted is never read or changed again.
 *
 * Run by the daily job with a small time budget until nothing is left at version 1. Only counts come back.
 */
export const FINGERPRINT_TABLES = ["thank_you_opt_outs", "email_stop_tokens", "charity_email_opt_outs", "charity_email_stop_tokens", "charity_thank_you_recipients"] as const;
export type FingerprintTable = (typeof FINGERPRINT_TABLES)[number];

const PAGE = 1000;
const BATCH = 200;

export type ConvertSummary = {
  /** Rows changed or merged this run. */
  converted: number;
  /** Rows still at version 1 after this run, per table (0 everywhere: nothing left to do). */
  left: Record<FingerprintTable, number>;
  /** True when the time ran out before every table was read to the end. */
  cutOff: boolean;
};

export async function convertEmailFingerprints(deadline: number): Promise<ConvertSummary> {
  const db = createAdminClient();
  let converted = 0;
  let cutOff = false;
  for (const table of FINGERPRINT_TABLES) {
    // Keyset paging by value: a value that could not be converted is passed over, never read again in this run.
    let after = "";
    for (;;) {
      if (Date.now() >= deadline) {
        cutOff = true;
        break;
      }
      let q = db.from(table).select("email_hash").eq("email_hash_v", 1).order("email_hash").limit(PAGE);
      if (after) q = q.gt("email_hash", after);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as { email_hash: string }[];
      if (!rows.length) break;
      after = rows[rows.length - 1].email_hash;
      const olds = [...new Set(rows.map((r) => r.email_hash))].filter((h) => /^[0-9a-f]{64}$/.test(h));
      for (let i = 0; i < olds.length; i += BATCH) {
        if (Date.now() >= deadline) {
          cutOff = true;
          break;
        }
        const batch = olds.slice(i, i + BATCH);
        const { data: n, error: e } = await db.rpc("convert_email_fingerprints", { p_table: table, p_old: batch, p_new: batch.map(keyLegacyHash) });
        if (e) throw new Error(e.message);
        converted += typeof n === "number" ? n : 0;
      }
      if (cutOff || rows.length < PAGE) break;
    }
    if (cutOff) break;
  }
  const left = {} as Record<FingerprintTable, number>;
  for (const table of FINGERPRINT_TABLES) {
    const { count, error } = await db.from(table).select("email_hash", { count: "exact", head: true }).eq("email_hash_v", 1);
    if (error) throw new Error(error.message);
    left[table] = count ?? 0;
  }
  return { converted, left, cutOff };
}
