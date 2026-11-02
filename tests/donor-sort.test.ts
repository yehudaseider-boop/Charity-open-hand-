/** Sorting the charity's donors list: by name, total, latest gift and first gift, with imported donors (no gifts) last. */
import { describe, expect, it } from "vitest";
import { DONOR_SORTS, parseDonorSort, sortDonors, type Sortable } from "@/lib/charity/donor-sort";

const row = (id: string, name: string, totalCents: number, firstAt: string | null, lastAt: string | null): Sortable => ({ id, name, totalCents, firstAt, lastAt });
// In the order the database gives (most given first).
const list = [
  row("a", "zanele Mokoena", 500_000, "2025-01-10T10:00:00+02:00", "2026-10-01T10:00:00+02:00"),
  row("b", "Ahmed Patel", 125_000, "2024-03-05T10:00:00+02:00", "2026-06-01T10:00:00+02:00"),
  row("c", "Émile du Toit", 125_000, "2026-09-01T10:00:00+02:00", "2026-09-01T10:00:00+02:00"),
  row("d", "", 3_000, "2026-02-01T10:00:00+02:00", "2026-11-01T10:00:00+02:00"),
  row("e", "Bongani Dlamini", 0, null, null), // imported, no gifts yet
];
const ids = (rows: Sortable[]) => rows.map((r) => r.id).join("");

describe("donor sort from the address", () => {
  it("knows the four sorts and falls back to the usual order for anything else", () => {
    expect(Object.keys(DONOR_SORTS)).toEqual(["name", "total", "latest", "first"]);
    for (const s of ["name", "total", "latest", "first"]) expect(parseDonorSort(s)).toBe(s);
    for (const s of [undefined, "", "NAME", "oldest", "toString", "__proto__", ["name"], 1]) expect(parseDonorSort(s)).toBeNull();
  });
});

describe("sortDonors", () => {
  it("with no sort keeps the order it was given, as a new array", () => {
    const out = sortDonors(list, null);
    expect(ids(out)).toBe("abcde");
    expect(out).not.toBe(list);
  });

  it("by name: A to Z, ignoring case and accents; a line without a name goes last", () => {
    expect(ids(sortDonors(list, "name"))).toBe("becad");
  });

  it("by total: highest first, ties keep the usual order, no gifts last", () => {
    expect(ids(sortDonors(list, "total"))).toBe("abcde");
    expect(ids(sortDonors([...list].reverse(), "total"))).toBe("acbde");
  });

  it("by latest gift: newest first, people with no gifts last", () => {
    expect(ids(sortDonors(list, "latest"))).toBe("dacbe");
  });

  it("by first gift: oldest first, people with no gifts last", () => {
    expect(ids(sortDonors(list, "first"))).toBe("badce");
  });

  it("does not change the list it was given", () => {
    const copy = list.map((r) => ({ ...r }));
    sortDonors(list, "name");
    expect(list).toEqual(copy);
  });

  it("copes with an empty list and one line", () => {
    expect(sortDonors([], "name")).toEqual([]);
    expect(ids(sortDonors([list[0]], "latest"))).toBe("a");
  });
});
