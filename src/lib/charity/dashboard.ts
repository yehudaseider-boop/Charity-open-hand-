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

/** A monthly donation as the charity sees it (from `charity_monthly_list`). */
export type MonthlyRow = {
  recurring_id: string;
  status: "active" | "paused" | "failed" | "cancelled";
  /** Running, but this month's charge has been declined at least once and will be tried again. */
  retrying: boolean;
  amount_cents: number;
  charge_day: number | null;
  next_charge_at: string | null;
  started_at: string;
  last_paid_at: string | null;
  paid_count: number;
  paid_cents: number;
  wants_18a: boolean;
  is_anonymous: boolean;
  dedication_kind: string | null;
  dedication_name: string | null;
  donor_type: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  paused_at: string | null;
  ended_at: string | null;
};

export type MonthlyState = "running" | "retrying" | "paused" | "stopped" | "cancelled";

export const monthlyStateLabel = {
  running: { label: "Running", tone: "success" },
  retrying: { label: "Card declined, trying again", tone: "warning" },
  paused: { label: "Paused by the donor", tone: "neutral" },
  stopped: { label: "Stopped: card declined", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
} as const;

export function monthlyState(r: Pick<MonthlyRow, "status" | "retrying">): MonthlyState {
  if (r.status === "active") return r.retrying ? "retrying" : "running";
  if (r.status === "paused") return "paused";
  if (r.status === "failed") return "stopped";
  return "cancelled";
}

/** The day of the month in words: 29 to 31 collect on the last day of shorter months. */
export function chargeDayLabel(day: number | null): string | null {
  if (!day || day < 1 || day > 31) return null;
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return day >= 29 ? `the ${day}${suffix} (or the last day of a shorter month)` : `the ${day}${suffix}`;
}

/** Running monthly donations (including those being retried): how many, and what they bring in each month. */
export function monthlySummary(rows: Pick<MonthlyRow, "status" | "amount_cents">[]) {
  const running = rows.filter((r) => r.status === "active");
  return {
    runningCount: running.length,
    runningCentsPerMonth: running.reduce((t, r) => t + Number(r.amount_cents), 0),
    pausedCount: rows.filter((r) => r.status === "paused").length,
    endedCount: rows.filter((r) => r.status === "failed" || r.status === "cancelled").length,
  };
}
