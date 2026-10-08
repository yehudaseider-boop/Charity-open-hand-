/**
 * Filters for a charity's donations list. Everything here may appear in the
 * page address, so none of it is personal data. A search for a donor's name
 * or email is kept out of the address (see the donations page).
 */
import { zonedMidnight } from "@/lib/dates";

export const donationStatuses = {
  paid: { label: "Paid", tone: "success" },
  pending: { label: "Pending", tone: "warning" },
  failed: { label: "Failed", tone: "neutral" },
  refunded: { label: "Refunded", tone: "danger" },
  charged_back: { label: "Charged back", tone: "danger" },
} as const;

export type DonationStatus = keyof typeof donationStatuses;

/** Status filter choices: each status, plus refunded and charged back together. */
export const statusFilters = {
  paid: "Paid",
  pending: "Pending",
  failed: "Failed",
  reversed: "Refunded or charged back",
  refunded: "Refunded",
  charged_back: "Charged back",
} as const;
export type StatusFilter = keyof typeof statusFilters;

export type DonationFilters = {
  status?: StatusFilter;
  wants18a?: boolean;
  /** A campaign id, or "none" for donations outside any campaign. */
  campaign?: string;
  /** yyyy-mm-dd as typed, for the form. */
  fromDate?: string;
  toDate?: string;
  /** The same dates as Johannesburg midnights, for the query. */
  from?: string;
  toExclusive?: string;
  page: number;
};

type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

function calendarDate(v: string | undefined): [number, number, number] | undefined {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return undefined;
  return [y, mo, d];
}

/** Read the filters from the page address, ignoring anything malformed. */
export function parseDonationFilters(params: Params): DonationFilters {
  const f: DonationFilters = { page: 1 };
  const status = one(params.status);
  if (status && status in statusFilters) f.status = status as StatusFilter;
  const s18a = one(params["18a"]);
  if (s18a === "yes") f.wants18a = true;
  if (s18a === "no") f.wants18a = false;
  const campaign = one(params.campaign);
  if (campaign === "none" || (campaign && /^[0-9a-f-]{36}$/i.test(campaign))) f.campaign = campaign;

  const from = calendarDate(one(params.from));
  if (from) {
    f.fromDate = one(params.from);
    f.from = zonedMidnight(...from);
  }
  const to = calendarDate(one(params.to));
  if (to) {
    f.toDate = one(params.to);
    // Up to the end of that day: midnight at the start of the next.
    const next = new Date(Date.UTC(to[0], to[1] - 1, to[2] + 1));
    f.toExclusive = zonedMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  }

  const page = Number(one(params.page));
  if (Number.isInteger(page) && page > 1 && page <= 10_000) f.page = page;
  return f;
}

/** The page address for a set of filters (search is never part of it). */
export function donationFiltersQuery(f: DonationFilters, page = f.page): string {
  const q = new URLSearchParams();
  if (f.status) q.set("status", f.status);
  if (f.wants18a !== undefined) q.set("18a", f.wants18a ? "yes" : "no");
  if (f.campaign) q.set("campaign", f.campaign);
  if (f.fromDate) q.set("from", f.fromDate);
  if (f.toDate) q.set("to", f.toDate);
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `?${s}` : "";
}

/**
 * A donor search as typed, made safe for the database filter: characters
 * that have meaning in the filter syntax are dropped, and it is kept short.
 */
export function cleanDonorSearch(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.replace(/[,()"'\\*%:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** The cookie that holds a donor search for one charity's donations page. */
export function searchCookieName(charityId: string): string {
  return `donor-search-${charityId}`;
}
