/**
 * The filters on a charity's Donations page, shared with its CSV download so the file always
 * matches the screen. Pure (tested). Periods are Johannesburg calendar days, inclusive.
 */
import { taxYearFor, taxYearRange } from "@/lib/dates";
import { isGiftSource, type GiftSource } from "@/lib/donations/source";
import { containsPattern, isDonationStatus, safeSearch, saDate, type DonationStatus } from "./dashboard";

export const periodOptions = {
  all: "Any time",
  "this-month": "This month",
  "last-month": "Last month",
  "this-tax-year": "This tax year",
  "last-tax-year": "Last tax year",
  custom: "Choose dates",
} as const;
export type PeriodKey = keyof typeof periodOptions;

export type DonationFilters = {
  status: DonationStatus | "all";
  q: string;
  period: PeriodKey;
  /** Inclusive yyyy-mm-dd, set for every period except "all". */
  fromDate: string | null;
  toDate: string | null;
  /** One campaign (its id), "none" for gifts to no campaign, or "" for all. */
  campaign: string;
  /** Where the gifts came from, "unknown" for older gifts with none, or "" for all. */
  source: GiftSource | "unknown" | "";
};

const isoDay = /^\d{4}-\d{2}-\d{2}$/;
const dayAfter = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, day + 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
};
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseDonationFilters(params: Params, now: Date = new Date()): DonationFilters {
  const rawCampaign = one(params.campaign);
  const campaign = rawCampaign === "none" || uuid.test(rawCampaign) ? rawCampaign.toLowerCase() : "";
  const rawSource = one(params.source);
  const source = rawSource === "unknown" || isGiftSource(rawSource) ? rawSource : "";
  return { ...dates(params, now), campaign, source };
}

function dates(params: Params, now: Date): Omit<DonationFilters, "campaign" | "source"> {
  const rawStatus = one(params.status);
  const status = rawStatus !== "all" && isDonationStatus(rawStatus) ? rawStatus : "all";
  const q = safeSearch(one(params.q));
  const rawPeriod = one(params.period);
  let period: PeriodKey = rawPeriod in periodOptions ? (rawPeriod as PeriodKey) : "all";
  // Both dates filled in with "Any time" still chosen: they meant those dates.
  if (period === "all" && isoDay.test(one(params.from)) && isoDay.test(one(params.to))) period = "custom";
  const today = saDate(now);
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (period) {
    case "this-month":
      return { status, q, period, fromDate: `${y}-${pad(m)}-01`, toDate: `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}` };
    case "last-month": {
      const ly = m === 1 ? y - 1 : y;
      const lm = m === 1 ? 12 : m - 1;
      return { status, q, period, fromDate: `${ly}-${pad(lm)}-01`, toDate: `${ly}-${pad(lm)}-${pad(lastDayOfMonth(ly, lm))}` };
    }
    case "this-tax-year":
    case "last-tax-year": {
      const ty = taxYearFor(now) - (period === "last-tax-year" ? 1 : 0);
      const { start, end } = taxYearRange(ty);
      return { status, q, period, fromDate: start, toDate: end };
    }
    case "custom": {
      const from = one(params.from);
      const to = one(params.to);
      if (!isoDay.test(from) || !isoDay.test(to)) return { status, q, period: "all", fromDate: null, toDate: null };
      return from <= to ? { status, q, period, fromDate: from, toDate: to } : { status, q, period, fromDate: to, toDate: from };
    }
    default:
      return { status, q, period: "all", fromDate: null, toDate: null };
  }
}

/** The filters as a query string (for links, paging and the CSV download). */
export function filtersToQuery(f: DonationFilters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  if (f.status !== "all") p.set("status", f.status);
  if (f.q) p.set("q", f.q);
  if (f.campaign) p.set("campaign", f.campaign);
  if (f.source) p.set("source", f.source);
  if (f.period !== "all") p.set("period", f.period);
  if (f.period === "custom" && f.fromDate && f.toDate) {
    p.set("from", f.fromDate);
    p.set("to", f.toDate);
  }
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

/** dd/mm/yyyy to dd/mm/yyyy, for the totals line and the file name. */
export function periodText(f: DonationFilters): string | null {
  if (!f.fromDate || !f.toDate) return null;
  const fmt = (d: string) => d.split("-").reverse().join("/");
  return `${fmt(f.fromDate)} to ${fmt(f.toDate)}`;
}

type Filterable<T> = {
  eq(column: string, value: string): T;
  gte(column: string, value: string): T;
  lt(column: string, value: string): T;
  or(filters: string): T;
  is(column: string, value: null): T;
};

/** Apply the filters to a charity_donations query. Dates go by when the payment went through. */
export function applyDonationFilters<T extends Filterable<T>>(query: T, f: DonationFilters): T {
  let q = query;
  if (f.status !== "all") q = q.eq("status", f.status);
  if (f.fromDate && f.toDate) q = q.gte("paid_at", `${f.fromDate}T00:00:00+02:00`).lt("paid_at", `${dayAfter(f.toDate)}T00:00:00+02:00`);
  if (f.campaign === "none") q = q.is("campaign_id", null);
  else if (f.campaign) q = q.eq("campaign_id", f.campaign);
  if (f.source === "unknown") q = q.is("came_from", null);
  else if (f.source) q = q.eq("came_from", f.source);
  if (f.q) {
    const like = containsPattern(f.q);
    q = q.or(`first_name.ilike.${like},last_name.ilike.${like},organisation_name.ilike.${like},email.ilike.${like}`);
  }
  return q;
}
