import { createHash } from "node:crypto";

/**
 * Changes to a public charity's profile made outside the website (security review, 23/11/2026).
 *
 * The database records every change an approved charity's own people make to these fields, from any path
 * (migration 20261123000002, audit action charity.profile_changed), with a fingerprint of each change. The website's
 * own saves put the same fingerprints in their audit rows (details.site_changes). The daily email lists the changes
 * no website save accounts for: those were made straight through the database, skipping the profile page and its
 * email to the reviewer. Website saves are never reported twice.
 */

/** The public profile fields the database watches, in the order the migration lists them. */
export const WATCHED_FIELDS = ["name_en", "logo_path", "cover_path", "description_en", "website", "impact_unit_cents", "impact_unit_one", "impact_unit_many"] as const;
export type WatchedField = (typeof WATCHED_FIELDS)[number];

const FIELD_WORDS: Record<WatchedField, string> = {
  name_en: "name",
  logo_path: "logo",
  cover_path: "cover image",
  description_en: "description",
  website: "website address",
  impact_unit_cents: "\"what one gift pays for\" figure",
  impact_unit_one: "\"what one gift pays for\" figure",
  impact_unit_many: "\"what one gift pays for\" figure",
};

const asText = (v: unknown): string => (v == null ? "" : String(v));

/** The fingerprint of one change, from old to new: the same as the migration's (md5 of old, char 31, new; null as empty). */
export function changePrint(from: unknown, to: unknown): string {
  return createHash("md5").update(`${asText(from)}\u001f${asText(to)}`).digest("hex");
}

/** The website's own save: a fingerprint for each watched field it changed, for its audit row (details.site_changes). */
export function siteChanges(before: Record<string, unknown>, after: Record<string, unknown>): Partial<Record<WatchedField, string>> {
  const out: Partial<Record<WatchedField, string>> = {};
  for (const f of WATCHED_FIELDS) {
    if (!(f in after)) continue;
    const from = before[f] ?? null;
    const to = after[f] ?? null;
    if ((from == null ? null : String(from)) === (to == null ? null : String(to))) continue;
    out[f] = changePrint(from, to);
  }
  return out;
}

export type AuditRow = { actor_user_id: string | null; entity_id: string | null; created_at: string; details: unknown };

/** A website save's audit row is written just after its update: this long at most. */
export const WEBSITE_SAVE_WINDOW_MS = 2 * 60_000;

const detailsOf = (row: AuditRow) => (row.details && typeof row.details === "object" ? (row.details as Record<string, unknown>) : {});
const mapOf = (v: unknown): Record<string, string> => (v && typeof v === "object" ? (v as Record<string, string>) : {});

/**
 * The recorded changes no website save accounts for. A change is the website's when a save by the same person, to the
 * same charity, written within a couple of minutes after it, has the same fingerprint for every field that changed
 * (so a change made straight through the database just before an unrelated website save is still reported).
 */
export function changesOutsideWebsite(changes: AuditRow[], websiteSaves: AuditRow[], windowMs = WEBSITE_SAVE_WINDOW_MS): AuditRow[] {
  return changes.filter((c) => {
    const prints = mapOf(detailsOf(c).prints);
    const fields = Object.keys(prints);
    if (!fields.length) return false;
    const at = new Date(c.created_at).getTime();
    return !websiteSaves.some((w) => {
      if (w.actor_user_id !== c.actor_user_id || w.entity_id !== c.entity_id) return false;
      const t = new Date(w.created_at).getTime();
      if (!(t >= at && t <= at + windowMs)) return false;
      const site = mapOf(detailsOf(w).site_changes);
      return fields.every((f) => site[f] === prints[f]);
    });
  });
}

/** One line per charity for the daily email, in plain words. */
export function outsideWebsiteLines(changes: AuditRow[]): string[] {
  const byCharity = new Map<string, { name: string; words: Set<string>; renames: string[] }>();
  for (const c of changes) {
    const d = detailsOf(c);
    const key = c.entity_id ?? "";
    const entry = byCharity.get(key) ?? { name: String(d.name ?? "A charity"), words: new Set<string>(), renames: [] };
    entry.name = String(d.name ?? entry.name);
    for (const f of Object.keys(mapOf(d.prints))) {
      if (f === "name_en") continue;
      const w = FIELD_WORDS[f as WatchedField];
      if (w) entry.words.add(w);
    }
    if (typeof d.name_from === "string" && typeof d.name_to === "string") entry.renames.push(`its name from "${d.name_from}" to "${d.name_to}"`);
    byCharity.set(key, entry);
  }
  return [...byCharity.values()].map((e) => {
    const parts = [...e.renames, ...[...e.words].map((w) => `its ${w}`)];
    const what = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
    return `${e.name} changed ${what} outside the website's own pages (straight through the database), so the reviewer wasn't told at the time. Check its public page and Admin, Charities.`;
  });
}
