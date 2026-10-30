/**
 * SAMPLE CONTENT. A fictional donor's giving for mock screens only.
 * All totals on screen are added up from these rows, never typed in.
 */
import type { Goal } from "../lib/goals";

export type Gift = { id: string; /** The Johannesburg calendar day it was paid. */ date: Date; /** The exact moment it was paid (live donations), for "new since you last looked". */ at?: Date; charitySlug: string; charityName: string; cents: number; monthly: boolean; with18a: boolean; /** The donor's own label for it ("Work giving", "Family"), if they gave one. */ label: string | null; /** The charity's own thank-you note, if it wrote one. */ thankYou?: string };

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

export const gifts: Gift[] = [
  { id: "g8", date: d(2026, 10, 2), charitySlug: "northcliff-meals-fund", charityName: "Northcliff Meals Fund", cents: 36_000, monthly: false, with18a: true, label: "Family" },
  { id: "g7", date: d(2026, 10, 1), charitySlug: "linksfield-learning-centre", charityName: "Linksfield Evening Learning Centre", cents: 50_000, monthly: true, with18a: true, label: "Work giving" },
  { id: "g6", date: d(2026, 9, 15), charitySlug: "sandton-patient-care", charityName: "Sandton Patient Care Volunteers", cents: 18_000, monthly: true, with18a: true, label: null },
  { id: "g5", date: d(2026, 9, 1), charitySlug: "linksfield-learning-centre", charityName: "Linksfield Evening Learning Centre", cents: 50_000, monthly: true, with18a: true, label: "Work giving" },
  { id: "g4", date: d(2026, 8, 28), charitySlug: "melville-community-hall", charityName: "Melville Community Hall Trust", cents: 18_000, monthly: false, with18a: false, label: null },
  { id: "g3", date: d(2026, 8, 1), charitySlug: "linksfield-learning-centre", charityName: "Linksfield Evening Learning Centre", cents: 50_000, monthly: true, with18a: true, label: "Work giving" },
  { id: "g2", date: d(2026, 1, 20), charitySlug: "northcliff-meals-fund", charityName: "Northcliff Meals Fund", cents: 100_000, monthly: false, with18a: true, label: "Family" },
  { id: "g1", date: d(2025, 11, 3), charitySlug: "linksfield-learning-centre", charityName: "Linksfield Evening Learning Centre", cents: 180_000, monthly: false, with18a: true, label: "Work giving" },
];

/** "Given elsewhere" entries the donor logs by hand (cash, other charities). */
export const givenElsewhere: { id: string; date: Date; recipient: string; cents: number; label: string | null }[] = [
  { id: "e1", date: d(2026, 6, 10), recipient: "School fun run (cash)", cents: 72_000, label: "Family" },
];

/** The sample donor's giving goal (preview only). */
export const sampleGoals: Goal[] = [
  { id: "sample", name: "Giving goal", basis: "fixed", percentPpm: null, fixedCents: 1_200_000, period: "year", year: "tax", counts: null },
];

export type Recurring = { id: string; charitySlug: string; charityName: string; /** The gift to the charity each month. */ cents: number; /** The contribution to Givezy paid with it, if any. */ contributionCents?: number; nextDate: Date | null; status: "active" | "paused" | "cancelled" | "failed"; /** A change is saved and waiting for the payment provider to apply it. */ syncing?: boolean; /** The card was declined: the donor can put in a new one. */ needsCard?: boolean };

export const recurring: Recurring[] = [
  { id: "r1", charitySlug: "linksfield-learning-centre", charityName: "Linksfield Evening Learning Centre", cents: 50_000, nextDate: d(2026, 11, 1), status: "active" },
  { id: "r2", charitySlug: "sandton-patient-care", charityName: "Sandton Patient Care Volunteers", cents: 18_000, nextDate: d(2026, 10, 15), status: "paused" },
];

/** Annual s18A receipts already issued (closed tax years only). Amounts are the sum of that year's s18A gifts. */
export type Receipt = { id: string; taxYear: number; charityName: string; number: string; cents: number; issued: Date };

export const receipts: Receipt[] = [
  { id: "x1", taxYear: 2026, charityName: "Linksfield Evening Learning Centre", number: "LTC-2026-0042", cents: 180_000, issued: d(2026, 3, 9) },
  { id: "x2", taxYear: 2026, charityName: "Northcliff Meals Fund", number: "NMF-2026-0118", cents: 100_000, issued: d(2026, 3, 9) },
];

export const sampleDonor = { name: "Sarah Dube", email: "sarah@example.co.za" };
