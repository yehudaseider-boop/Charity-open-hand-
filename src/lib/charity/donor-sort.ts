/**
 * How a charity orders its donors list (02/11/2026). Pure: no database, no clock. The order goes in the
 * page address (?sort=), so it survives a refresh and can be shared; an unknown value keeps the list's
 * usual order (most given first, as the database returns it).
 */

export const DONOR_SORTS = {
  name: "Name (A to Z)",
  total: "Total given (highest first)",
  latest: "Latest gift (newest first)",
  first: "First gift (oldest first)",
} as const;
export type DonorSort = keyof typeof DONOR_SORTS;

/** The sort asked for in the address, or null for the usual order. */
export function parseDonorSort(raw: unknown): DonorSort | null {
  return typeof raw === "string" && Object.hasOwn(DONOR_SORTS, raw) ? (raw as DonorSort) : null;
}

/** What a line of the list needs to be sorted. Someone with no gifts yet has no dates and R0. */
export type Sortable = { id: string; name: string; totalCents: number; firstAt: string | null; lastAt: string | null };

const collator = new Intl.Collator("en-ZA", { sensitivity: "base", numeric: true, ignorePunctuation: true });
const time = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

/**
 * The list in the order asked for, as a new array. Ties keep the usual order. Lines without gifts (an
 * imported donor) go after everyone with gifts when sorting by gifts; a line with no name goes last by name.
 * With no sort, the list comes back in the order it was given.
 */
export function sortDonors<T extends Sortable>(rows: readonly T[], sort: DonorSort | null): T[] {
  const indexed = rows.map((row, i) => ({ row, i }));
  if (!sort) return indexed.map((x) => x.row);
  const byDate = (pick: (r: T) => string | null, newestFirst: boolean) => (a: T, b: T) => {
    const ta = time(pick(a)), tb = time(pick(b));
    if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.isNaN(ta) === Number.isNaN(tb) ? 0 : Number.isNaN(ta) ? 1 : -1;
    return newestFirst ? tb - ta : ta - tb;
  };
  const compare: (a: T, b: T) => number =
    sort === "name"
      ? (a, b) => {
          const na = a.name.trim(), nb = b.name.trim();
          if (!na || !nb) return !na === !nb ? 0 : !na ? 1 : -1;
          return collator.compare(na, nb);
        }
      : sort === "total"
        ? (a, b) => b.totalCents - a.totalCents
        : sort === "latest"
          ? byDate((r) => r.lastAt, true)
          : byDate((r) => r.firstAt, false);
  return indexed.sort((a, b) => compare(a.row, b.row) || a.i - b.i).map((x) => x.row);
}
