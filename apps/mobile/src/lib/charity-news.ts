import type { Gift, Recurring } from "../data/giving";
import type { CharityUpdate } from "../data/sample";
import { ddmmyyyy, jhbDay } from "./format";

/**
 * "News from your charities" on Home (decided 08/11/2026): the latest updates from charities the donor gave to, in
 * the charity's own words, so there is a reason to open the app that is useful and never pressure. Pure, so it is
 * tested without a phone.
 */

/** A charity the donor gave to, and how: a monthly donation, or the day of their last gift. */
export type GaveTo = { slug: string; name: string; monthly: boolean; lastGift: Date | null };

export type NewsItem = {
  id: string;
  slug: string;
  charityName: string;
  body: string;
  photoUrl: string | null;
  /** When it was posted, in plain words: "Today", "Yesterday" or dd/mm/yyyy. */
  when: string;
  /** How the donor is connected to it: "You give every month" or "You gave in October". */
  relation: string;
  postedAt: Date;
};

/** How many updates Home shows, and how old they may be. Old news isn't news. */
export const NEWS_LIMIT = 3;
export const NEWS_MAX_AGE_DAYS = 60;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The charities the donor gave to: an active or paused monthly donation, or any paid gift. Most recent first. */
export function charitiesGivenTo(gifts: Gift[], recurring: Recurring[]): GaveTo[] {
  const by = new Map<string, GaveTo>();
  for (const g of gifts) {
    const seen = by.get(g.charitySlug);
    if (!seen) by.set(g.charitySlug, { slug: g.charitySlug, name: g.charityName, monthly: false, lastGift: g.date });
    else if (!seen.lastGift || g.date > seen.lastGift) seen.lastGift = g.date;
  }
  for (const r of recurring) {
    if (r.status !== "active" && r.status !== "paused") continue;
    const seen = by.get(r.charitySlug);
    if (seen) seen.monthly = true;
    else by.set(r.charitySlug, { slug: r.charitySlug, name: r.charityName, monthly: true, lastGift: null });
  }
  return [...by.values()].sort((a, b) => (b.lastGift?.getTime() ?? 0) - (a.lastGift?.getTime() ?? 0));
}

/**
 * How many charities' news is asked for: the most recent ones the donor gave to (the list is most recent first).
 * Keeps the query's address short however many charities someone has given to.
 */
export const NEWS_MAX_CHARITIES = 20;

/** The charities whose news to ask for (slugs, most recent first), as one key: the same charities, the same key. */
export function newsKey(slugs: string[], max = NEWS_MAX_CHARITIES): string {
  return slugs.slice(0, max).join(",");
}

/**
 * The charities the donor asked for "No news or appeals from this charity", as `my_news_opt_outs()` returns them:
 * a plain list of ids, or rows of `{ my_news_opt_outs: id }`. Anything else is null, which means "not known", so
 * no news is shown at all rather than risk news from a charity they said no to.
 */
export function optOutIds(data: unknown): Set<string> | null {
  if (data === null || data === undefined) return new Set();
  if (!Array.isArray(data)) return null;
  const out = new Set<string>();
  for (const v of data) {
    const id = typeof v === "string" ? v : v && typeof v === "object" ? (v as Record<string, unknown>).my_news_opt_outs : undefined;
    if (typeof id !== "string") return null;
    out.add(id);
  }
  return out;
}

/** "Today", "Yesterday", or the Johannesburg date. */
export function postedWhen(posted: Date, today: Date): string {
  const day = jhbDay(posted);
  const days = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return ddmmyyyy(day);
}

/** "You give every month", or "You gave in October" (with the year when it wasn't this year). */
export function relationLine(c: GaveTo, today: Date): string {
  if (c.monthly) return "You give every month";
  if (!c.lastGift) return "You gave before";
  const month = MONTHS[c.lastGift.getMonth()];
  return c.lastGift.getFullYear() === today.getFullYear() ? `You gave in ${month}` : `You gave in ${month} ${c.lastGift.getFullYear()}`;
}

/** Newest first, at most NEWS_LIMIT, nothing older than NEWS_MAX_AGE_DAYS, and no empty updates. */
export function newsFeed(gaveTo: GaveTo[], updatesBySlug: Map<string, CharityUpdate[]>, today: Date, maxAgeDays = NEWS_MAX_AGE_DAYS): NewsItem[] {
  const oldest = today.getTime() - maxAgeDays * 86_400_000;
  const items: NewsItem[] = [];
  for (const c of gaveTo) {
    for (const u of updatesBySlug.get(c.slug) ?? []) {
      const body = u.body.trim();
      if (!body || u.date.getTime() < oldest) continue;
      items.push({ id: u.id, slug: c.slug, charityName: c.name, body, photoUrl: u.photoUrl, when: postedWhen(u.date, today), relation: relationLine(c, today), postedAt: u.date });
    }
  }
  return items.sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime()).slice(0, NEWS_LIMIT);
}
