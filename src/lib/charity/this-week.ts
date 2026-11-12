import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { plural } from "@/lib/text";
import { progressPercent } from "./campaigns";

/**
 * "Needs you this week" on the charity overview (CRM step 17, 10/11/2026): what needs a person, each line with one
 * button to the page where it is done. Pure: the overview reads the facts and this decides the lines, so the rules
 * are tested in one place. A line with nothing to do is left out. A fact that couldn't be read is `null`: its line is
 * left out and its name goes in `unavailable`, so the card can say what it couldn't check instead of a wrong "nothing".
 */

export type WeekItem = { key: string; text: string; href: string; link: string };
export type ThisWeek = { items: WeekItem[]; unavailable: string[] };

export type ThisWeekFacts = {
  base: string;
  /** Today in Johannesburg, yyyy-mm-dd: a follow-up before today says when it was due. */
  todaySa: string;
  /** Donors whose first gift to this charity came in the last 7 days and who haven't been thanked personally since. */
  toThank: { count: number; onlyDonorId: string | null } | null;
  /** Monthly donations declined this month and being tried again, and monthly donors paused in the last 30 days. */
  monthly: { retrying: number; pausedRecently: number } | null;
  /** Monthly donors who stopped in the last 30 days, counted as the stopped monthly donors list counts them. */
  stopped: { count: number; centsPerMonth: number } | null;
  /** Donors who asked for an s18A receipt and still haven't added the details SARS needs. */
  s18aMissing: number | null;
  lapsed: { count: number; periodText: string };
  followUps: { id: string; donor_id: string; donor_name: string; what: string; due_on: string }[];
  endingSoon: { id: string; title: string; endsAt: string | null; raisedCents: number; targetCents: number | null }[];
  refunded: { count: number; cents: number };
  chargedBack: number;
};

/** The names used in "We couldn't check …" when a fact couldn't be read. */
export const WEEK_SOURCE_NAMES = {
  toThank: "new donors to thank",
  monthly: "monthly donations",
  stopped: "monthly donors who stopped",
  s18aMissing: "missing s18A details",
} as const;

const SHOWN_FOLLOW_UPS = 5;

export function thisWeek(f: ThisWeekFacts): ThisWeek {
  const items: WeekItem[] = [];
  const unavailable: string[] = [];
  const b = f.base;

  if (f.toThank === null) unavailable.push(WEEK_SOURCE_NAMES.toThank);
  else if (f.toThank.count > 0) {
    // One donor: straight to their page, where "Say thank you" is. More: the new donors on the Donors list.
    const one = f.toThank.count === 1 && f.toThank.onlyDonorId;
    items.push({
      key: "thank",
      text: `${plural(f.toThank.count, "new donor")} this week, not yet thanked personally`,
      href: one ? `${b}/donors/${f.toThank.onlyDonorId}` : `${b}/donors?group=new`,
      link: "Say thank you",
    });
  }

  if (f.monthly === null) unavailable.push(WEEK_SOURCE_NAMES.monthly);
  else {
    if (f.monthly.retrying > 0) items.push({ key: "retry", text: `${plural(f.monthly.retrying, "monthly donation")} declined this month and being tried again`, href: `${b}/monthly?show=running`, link: "See who" });
    if (f.monthly.pausedRecently > 0) items.push({ key: "paused", text: `${plural(f.monthly.pausedRecently, "monthly donor")} paused in the last 30 days`, href: `${b}/monthly?show=paused`, link: "See who" });
  }

  if (f.stopped === null) unavailable.push(WEEK_SOURCE_NAMES.stopped);
  else if (f.stopped.count > 0) {
    items.push({
      key: "stopped",
      text: `${plural(f.stopped.count, "monthly donor")} stopped in the last 30 days (${formatRand(f.stopped.centsPerMonth)} a month)`,
      href: `${b}/monthly/stopped?period=30-days`,
      link: "See who",
    });
  }

  if (f.s18aMissing === null) unavailable.push(WEEK_SOURCE_NAMES.s18aMissing);
  else if (f.s18aMissing > 0) {
    items.push({
      key: "s18a",
      text: `${plural(f.s18aMissing, "donor")} asked for an s18A receipt but ${f.s18aMissing === 1 ? "hasn't" : "haven't"} added the details SARS needs`,
      href: `${b}/donors?s18a=details_missing`,
      link: "See who",
    });
  }

  if (f.lapsed.count > 0) items.push({ key: "lapsed", text: `${plural(f.lapsed.count, "donor")} ${f.lapsed.count === 1 ? "hasn't" : "haven't"} given in the last ${f.lapsed.periodText}`, href: `${b}/donors?group=lapsed`, link: "See who" });

  // Follow-ups the charity set itself, due today or earlier: the first few by name, then the count.
  for (const r of f.followUps.slice(0, SHOWN_FOLLOW_UPS)) {
    const late = r.due_on < f.todaySa ? ` (was due ${formatDate(`${r.due_on}T12:00:00+02:00`)})` : "";
    items.push({ key: `f-${r.id}`, text: `Follow up with ${r.donor_name}: ${r.what}${late}`, href: `${b}/donors/${r.donor_id}`, link: "Open" });
  }
  if (f.followUps.length > SHOWN_FOLLOW_UPS) items.push({ key: "f-more", text: `${plural(f.followUps.length - SHOWN_FOLLOW_UPS, "more follow-up")} due`, href: `${b}/donors`, link: "See donors" });

  for (const c of f.endingSoon) {
    const goal = c.targetCents ? `, at ${progressPercent(c.raisedCents, c.targetCents)}% of its goal` : "";
    items.push({ key: `c-${c.id}`, text: `"${c.title}" ends on ${formatDate(c.endsAt as string)}${goal}`, href: `${b}/campaigns`, link: "Share it again" });
  }
  if (f.refunded.count > 0) items.push({ key: "refund", text: `${plural(f.refunded.count, "donation")} refunded (${formatRand(f.refunded.cents)})`, href: `${b}/donations?status=refunded`, link: "See them" });
  if (f.chargedBack > 0) items.push({ key: "cb", text: `${plural(f.chargedBack, "donation")} charged back`, href: `${b}/donations?status=charged_back`, link: "See them" });

  return { items, unavailable };
}

/** "new donors to thank and monthly donations": the names joined for one sentence. */
export function listInWords(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Whose first gift came within the last 7 days (the week this card is about). */
export const TO_THANK_DAYS = 7;

/**
 * Of these donors, the ones to offer "Say thank you" this week: first gift to the charity in the last 7 days, an
 * address we can email (not erased, not a gift the charity only recorded), not thanked personally since that gift and
 * not someone who asked not to get thank-you emails. Pure, so the store only reads the facts.
 */
export function donorsToThank<T extends { donor_id: string; first_paid_at: string; email: string | null }>(
  donors: T[],
  now: Date,
  facts: { canEmail: (email: string) => boolean; lastThankedAt: ReadonlyMap<string, string>; optedOut: ReadonlySet<string> },
): T[] {
  const since = now.getTime() - TO_THANK_DAYS * 86_400_000;
  return donors.filter((d) => {
    const first = new Date(d.first_paid_at).getTime();
    if (!(first >= since && first <= now.getTime())) return false;
    // No address: erased, or the viewer's role can't see contact details.
    if (!d.email || !facts.canEmail(d.email)) return false;
    if (facts.optedOut.has(d.email.trim().toLowerCase())) return false;
    const thanked = facts.lastThankedAt.get(d.donor_id);
    return !(thanked && new Date(thanked).getTime() >= first);
  });
}
