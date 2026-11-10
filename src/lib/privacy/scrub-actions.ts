/**
 * Erasing someone (POPIA) also takes their name out of the dashboard's action records, which the charity's Activity
 * page shows (team roles, 10/11/2026). Pure helpers; src/lib/privacy/erase.ts reads and writes the rows.
 */

/** The s18A receipt check's actions name the donor (details.name) and the next donor to check (details.nextName). */
export const CERTIFICATE_KINDS = ["certificate_approved", "certificate_edited", "certificate_declined", "certificate_reopened"] as const;
/** Team actions name a person by email address (details.email). */
export const TEAM_KINDS = ["member_added", "member_removed", "role_changed"] as const;

const norm = (s: unknown) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").toLowerCase() : "");

/** The names a donor gave at checkout, as the receipt check shows them: "First Last", or the organisation's name. */
export function namesFrom(rows: { first_name?: string | null; last_name?: string | null; organisation_name?: string | null }[]): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    const person = norm(`${r.first_name ?? ""} ${r.last_name ?? ""}`);
    if (person) out.add(person);
    const org = norm(r.organisation_name);
    if (org) out.add(org);
  }
  return out;
}

/**
 * A certificate action's details with the erased donor's name replaced by "a donor", or null when nothing names them.
 * Matching by name can also blank another donor with the very same name: that only loses a name, never shows one.
 */
export function scrubCertificateDetails(details: Record<string, unknown>, names: Set<string>): Record<string, unknown> | null {
  let changed = false;
  const out = { ...details };
  if (names.has(norm(details.name))) {
    out.name = "a donor";
    changed = true;
  }
  if (names.has(norm(details.nextName))) {
    out.nextName = "the next donor";
    changed = true;
  }
  return changed ? out : null;
}
