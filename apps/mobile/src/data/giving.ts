/**
 * SAMPLE CONTENT. A fictional donor's giving for mock screens only.
 * All totals on screen are added up from these rows, never typed in.
 */
/** Where the money for a gift comes from: maaser, chomesh, or general tzedaka. The donor chooses at checkout. */
export type GivingKind = "maaser" | "chomesh" | "tzedaka";

export type Gift = { id: string; date: Date; charitySlug: string; charityName: string; cents: number; monthly: boolean; with18a: boolean; kind: GivingKind };

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

export const gifts: Gift[] = [
  { id: "g8", date: d(2026, 10, 2), charitySlug: "northcliff-meals-fund", charityName: "Northcliff Meals Fund", cents: 36_000, monthly: false, with18a: true, kind: "chomesh" },
  { id: "g7", date: d(2026, 10, 1), charitySlug: "linksfield-torah-centre", charityName: "Linksfield Torah Learning Centre", cents: 50_000, monthly: true, with18a: true, kind: "maaser" },
  { id: "g6", date: d(2026, 9, 15), charitySlug: "sandton-bikur-cholim", charityName: "Sandton Bikur Cholim", cents: 18_000, monthly: true, with18a: true, kind: "tzedaka" },
  { id: "g5", date: d(2026, 9, 1), charitySlug: "linksfield-torah-centre", charityName: "Linksfield Torah Learning Centre", cents: 50_000, monthly: true, with18a: true, kind: "maaser" },
  { id: "g4", date: d(2026, 8, 28), charitySlug: "glenhazel-shul-fund", charityName: "Glenhazel Community Shul Fund", cents: 18_000, monthly: false, with18a: false, kind: "tzedaka" },
  { id: "g3", date: d(2026, 8, 1), charitySlug: "linksfield-torah-centre", charityName: "Linksfield Torah Learning Centre", cents: 50_000, monthly: true, with18a: true, kind: "maaser" },
  { id: "g2", date: d(2026, 1, 20), charitySlug: "northcliff-meals-fund", charityName: "Northcliff Meals Fund", cents: 100_000, monthly: false, with18a: true, kind: "maaser" },
  { id: "g1", date: d(2025, 11, 3), charitySlug: "linksfield-torah-centre", charityName: "Linksfield Torah Learning Centre", cents: 180_000, monthly: false, with18a: true, kind: "maaser" },
];

/** "Given elsewhere" entries the donor logs by hand, for maaser. */
export const givenElsewhere: { id: string; date: Date; recipient: string; cents: number; kind: GivingKind }[] = [
  { id: "e1", date: d(2026, 6, 10), recipient: "Shul appeal (cash)", cents: 72_000, kind: "maaser" },
];

/**
 * The donor's own targets per month or per year (Rosh Hashana to Rosh Hashana):
 * one for maaser and, if they keep it, one for chomesh. Null chomesh = maaser only.
 */
export const sampleMaaserTarget: { period: "month" | "year"; maaserCents: number; chomeshCents: number | null } = {
  period: "month",
  maaserCents: 60_000,
  chomeshCents: 60_000,
};

export type Recurring = { id: string; charitySlug: string; charityName: string; cents: number; nextDate: Date | null; status: "active" | "paused" };

export const recurring: Recurring[] = [
  { id: "r1", charitySlug: "linksfield-torah-centre", charityName: "Linksfield Torah Learning Centre", cents: 50_000, nextDate: d(2026, 11, 1), status: "active" },
  { id: "r2", charitySlug: "sandton-bikur-cholim", charityName: "Sandton Bikur Cholim", cents: 18_000, nextDate: d(2026, 10, 15), status: "paused" },
];

/** Annual 18A receipts already issued (closed tax years only). Amounts are the sum of that year's 18A gifts. */
export type Receipt = { id: string; taxYear: number; charityName: string; number: string; cents: number; issued: Date };

export const receipts: Receipt[] = [
  { id: "x1", taxYear: 2026, charityName: "Linksfield Torah Learning Centre", number: "LTC-2026-0042", cents: 180_000, issued: d(2026, 3, 9) },
  { id: "x2", taxYear: 2026, charityName: "Northcliff Meals Fund", number: "NMF-2026-0118", cents: 100_000, issued: d(2026, 3, 9) },
];

export const sampleDonor = { name: "Sarah Levin", email: "sarah@example.co.za" };
