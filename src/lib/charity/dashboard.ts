/** Small pure helpers for the charity dashboard. */
import { taxYearFor, taxYearRange } from "@/lib/dates";

/** South Africa has no daylight saving, so Johannesburg midnight is always +02:00. */
const sa = (isoDate: string) => `${isoDate}T00:00:00+02:00`;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Johannesburg calendar date (yyyy-mm-dd) of a moment. */
export function saDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(now);
}

export type Period = { from: string; to: string };

/** This calendar month, as timestamps for the database: first moment to the first moment of next month. */
export function thisMonth(now: Date): Period {
  const [y, m] = saDate(now).split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from: sa(first), to: sa(next) };
}

/** The current SARS tax year (1 March to the end of February), and its number. */
export function thisTaxYear(now: Date): Period & { taxYear: number; end: string } {
  const taxYear = taxYearFor(now);
  const { start, end } = taxYearRange(taxYear);
  return { taxYear, from: sa(start), to: sa(addDays(end, 1)), end };
}

export const allTime: Period = { from: sa("2000-01-01"), to: sa("2100-01-01") };

/** The name to show for a donor: person, or organisation. */
export function donorName(d: { donor_type: string | null; first_name: string | null; last_name: string | null; organisation_name: string | null }): string {
  if (d.donor_type && d.donor_type !== "individual") return (d.organisation_name ?? "").trim() || "Organisation";
  return [d.first_name, d.last_name].map((x) => x?.trim()).filter(Boolean).join(" ") || "Donor";
}

/** Characters that would change the meaning of a PostgREST filter, removed from search text. */
export function safeSearch(q: string): string {
  return q.replace(/[,()*%_\\"'.:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export const donationStatus = {
  paid: { label: "Paid", tone: "success" },
  pending: { label: "Pending", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  refunded: { label: "Refunded", tone: "neutral" },
  charged_back: { label: "Charged back", tone: "danger" },
} as const;

export type DonationStatus = keyof typeof donationStatus;

export function isDonationStatus(s: string): s is DonationStatus {
  return s in donationStatus;
}

/** Address lines as one text line, skipping empty parts. */
export function addressLine(a: { address_line1?: string | null; address_line2?: string | null; suburb?: string | null; city?: string | null; postal_code?: string | null }): string {
  return [a.address_line1, a.address_line2, a.suburb, a.city, a.postal_code].map((x) => x?.trim()).filter(Boolean).join(", ");
}
