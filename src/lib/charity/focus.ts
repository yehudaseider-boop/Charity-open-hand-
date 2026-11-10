/**
 * A charity's own focus ("What we're focused on right now", 10/11/2026): one at a time, a short title and message,
 * shown between two Johannesburg dates, optionally pointing at one of its campaigns. Outside the dates it simply
 * doesn't show. This is the charity's own choice on its own page: Givezy's "cause of the week" is separate.
 * Dependency-free: the app shares this file.
 */

export type Focus = {
  /** One of the charity's campaigns, when it chose one. */
  campaignId: string | null;
  title: string;
  message: string;
  /** First and last day it shows, as yyyy-mm-dd on the Johannesburg calendar (both days included). */
  startsOn: string;
  endsOn: string;
};

export type FocusRow = { campaign_id: string | null; title: string; message: string; starts_on: string; ends_on: string };
export const FOCUS_COLUMNS = "campaign_id, title, message, starts_on, ends_on";

export const FOCUS_TITLE_MIN = 3;
export const FOCUS_TITLE_MAX = 80;
export const FOCUS_MESSAGE_MAX = 200;
/** The longest a focus can run, counting its first and last day. */
export const FOCUS_MAX_DAYS = 62;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Today on the Johannesburg calendar, as yyyy-mm-dd. South Africa is two hours ahead of UTC all year. */
export function jhbToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 2 * 3_600_000).toISOString().slice(0, 10);
}

/** How many days from the first to the last, counting both. Calendar maths only: no time zone involved. */
export function focusDays(startsOn: string, endsOn: string): number {
  return Math.round((Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`)) / 86_400_000) + 1;
}

export type FocusStatus = "scheduled" | "showing" | "ended";

/** Where a focus is on a given Johannesburg day: not started, showing (first and last day included), or over. */
export function focusStatus(f: Pick<Focus, "startsOn" | "endsOn">, today: string): FocusStatus {
  if (today < f.startsOn) return "scheduled";
  return today > f.endsOn ? "ended" : "showing";
}

export const FOCUS_STATUS_LABEL: Record<FocusStatus, string> = { scheduled: "Scheduled", showing: "Showing now", ended: "Ended" };

/** A stored row as a focus, or null when anything about it is off (so a bad row never reaches a page). */
export function focusFrom(row: Partial<FocusRow> | null | undefined): Focus | null {
  if (!row || typeof row.title !== "string" || typeof row.message !== "string") return null;
  const title = row.title.trim();
  const message = row.message.trim();
  if (!title || !message || !DAY.test(String(row.starts_on)) || !DAY.test(String(row.ends_on))) return null;
  return { campaignId: typeof row.campaign_id === "string" && row.campaign_id ? row.campaign_id : null, title, message, startsOn: String(row.starts_on), endsOn: String(row.ends_on) };
}

/** The focus to show on a public page today, or null. */
export function activeFocus(row: Partial<FocusRow> | null | undefined, today: string): Focus | null {
  const f = focusFrom(row);
  return f && focusStatus(f, today) === "showing" ? f : null;
}

/**
 * Where the focus card's give button goes: the chosen campaign while it is still taking gifts, otherwise the
 * charity's general giving (a campaign that has ended or been removed never gets a gift).
 */
export function focusCampaign<T extends { id: string }>(f: Pick<Focus, "campaignId">, openCampaigns: readonly T[]): T | null {
  return f.campaignId ? (openCampaigns.find((c) => c.id === f.campaignId) ?? null) : null;
}

/** yyyy-mm-dd as dd/mm/yyyy. */
export function focusDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
