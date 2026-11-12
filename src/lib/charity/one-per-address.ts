/**
 * One email per inbox in a send (review 12/11/2026). A person can be two donors to the same charity (one as
 * themselves and one for their company: donors are unique by email and donor type), so a send that goes donor by
 * donor would put the same email in their inbox twice. Senders keep the first donor for each address, as the monthly
 * thank-you does. Pure and dependency-free.
 */

/** The address as it is compared: trimmed, lower case. */
export const inboxKey = (email: string): string => email.trim().toLowerCase();

/** The first row for each address, in the order given. Rows without an address are kept as they are. */
export function onePerAddress<T>(rows: readonly T[], email: (row: T) => string | null | undefined): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const e = email(row);
    if (!e) return true;
    const key = inboxKey(e);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
