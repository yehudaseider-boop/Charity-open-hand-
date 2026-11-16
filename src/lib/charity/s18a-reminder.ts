/**
 * The Donors list's s18A filter and the "Remind to add their details" email (CRM step 2, Yossi 2.1, built 10/11/2026).
 *
 * Three filters: donors who asked for an s18A receipt, donors who didn't ask, and donors who asked but whose gift still
 * lacks what SARS needs ("details missing": the same rule the receipt run and the donor's "Add my details after paying"
 * use, `s18aDetailsMissing` and `canCompleteS18a`). The charity only ever sees what is missing, never a number.
 *
 * The reminder goes only to donors with details missing, and never to an erased donor, someone who turned off this
 * charity's emails, or someone who already had a message from this charity this week (decided 09/11/2026: at most one
 * message a week per donor). Pure: no database, no clock, so it can be tested.
 */
import { cleanDedicationName } from "@/lib/donations/dedication";
import { missingWords, type MissingDetail } from "@/lib/donations/s18a-details";
import type { EmailMessage } from "@/lib/email";
import { oneClickStopHeaders } from "@/lib/email/headers";
import { plural } from "@/lib/text";

export const S18A_FILTERS = {
  asked: "Asked for an s18A receipt",
  not_asked: "Didn't ask",
  details_missing: "Details missing",
} as const;

export type S18aFilter = keyof typeof S18A_FILTERS;

export function isS18aFilter(v: unknown): v is S18aFilter {
  return typeof v === "string" && Object.hasOwn(S18A_FILTERS, v);
}

/** What one hint under the filters says. */
export const S18A_FILTER_HINTS: Record<S18aFilter, string> = {
  asked: "Donors who asked for an s18A receipt on at least one gift to you",
  not_asked: "Donors who didn't ask for an s18A receipt on any gift to you",
  details_missing: "Donors who asked for an s18A receipt but haven't added the ID or registration number, or the address, SARS needs. Their gifts can't go on a receipt until they do",
};

/** Does this donor belong in the filter. `missing` holds the donors with details missing, and what each lacks. */
export function inS18aFilter(d: { donor_id: string; wants_18a: boolean }, filter: S18aFilter, missing: ReadonlyMap<string, MissingDetail[]>): boolean {
  if (filter === "asked") return d.wants_18a;
  if (filter === "not_asked") return !d.wants_18a;
  return missing.has(d.donor_id);
}

/** How many donors each filter holds. */
export function s18aCounts(donors: { donor_id: string; wants_18a: boolean }[], missing: ReadonlyMap<string, MissingDetail[]>): Record<S18aFilter, number> {
  const out: Record<S18aFilter, number> = { asked: 0, not_asked: 0, details_missing: 0 };
  for (const d of donors) for (const f of Object.keys(out) as S18aFilter[]) if (inS18aFilter(d, f, missing)) out[f]++;
  return out;
}

/** "SA ID number and address": what is missing, never a value. */
export function missingList(missing: MissingDetail[]): string {
  return missingWords(missing, "their").replace(/^their /, "");
}

/** The kinds in the order a sentence lists them, once each: the union over a donor's gifts. */
export function mergeMissing(a: MissingDetail[], b: MissingDetail[]): MissingDetail[] {
  const order: MissingDetail[] = ["id_number", "registration_number", "address"];
  const all = new Set([...a, ...b]);
  return order.filter((m) => all.has(m));
}

/** Why a chosen donor wasn't sent a reminder. */
/** The most donors one press can remind (CRM step 2): a long list is narrowed with a group, tag or search first. */
export const MAX_REMINDERS = 2000;

export const REMINDER_SKIPS = ["not_found", "erased", "complete", "recorded_only", "opted_out", "this_week"] as const;
export type ReminderSkip = (typeof REMINDER_SKIPS)[number];

export type ReminderCandidate = {
  donorId: string;
  /** Not one of this charity's donors with a paid gift (an old page, a changed list). */
  found: boolean;
  /** The address from their latest gift on Givezy; null when they have only gifts the charity recorded itself. */
  email: string | null;
  erased: boolean;
  missing: MissingDetail[];
  optedOut: boolean;
  messagedThisWeek: boolean;
};

export type ReminderPlan<T extends ReminderCandidate> = { send: T[]; skipped: Record<ReminderSkip, number> };

/** Who gets a reminder, and why each other donor doesn't. One reason per donor, the first that applies. */
export function planReminders<T extends ReminderCandidate>(candidates: T[]): ReminderPlan<T> {
  const skipped: Record<ReminderSkip, number> = { not_found: 0, erased: 0, complete: 0, recorded_only: 0, opted_out: 0, this_week: 0 };
  const send: T[] = [];
  for (const c of candidates) {
    const reason: ReminderSkip | null = !c.found
      ? "not_found"
      : c.erased
        ? "erased"
        : c.missing.length === 0
          ? "complete"
          : !c.email
            ? "recorded_only"
            : c.optedOut
              ? "opted_out"
              : c.messagedThisWeek
                ? "this_week"
                : null;
    if (reason) skipped[reason]++;
    else send.push(c);
  }
  return { send, skipped };
}

const SKIP_WORDS: Record<ReminderSkip, [string, string]> = {
  this_week: ["already had a message from you this week. They can get one from Monday", "already had a message from you this week. They can get one from Monday"],
  opted_out: ["turned off emails from you", "turned off emails from you"],
  complete: ["has added their details since, so needs no reminder", "have added their details since, so need no reminder"],
  recorded_only: ["has only gifts you recorded yourself, so Givezy can't email them. Contact them directly", "have only gifts you recorded yourself, so Givezy can't email them. Contact them directly"],
  erased: ["had their details erased at their request", "had their details erased at their request"],
  not_found: ["isn't on your donor list any more", "aren't on your donor list any more"],
};

/** "2 weren't sent: 1 already had a message from you this week ...; 1 turned off emails from you." Empty when none. */
export function skippedSentence(skipped: Partial<Record<ReminderSkip, number>>): string {
  const parts = (Object.keys(SKIP_WORDS) as ReminderSkip[])
    .filter((k) => (skipped[k] ?? 0) > 0)
    .map((k) => `${skipped[k]} ${SKIP_WORDS[k][skipped[k] === 1 ? 0 : 1]}`);
  if (!parts.length) return "";
  const total = (Object.values(skipped) as number[]).reduce((a, b) => a + (b ?? 0), 0);
  return `${total} ${total === 1 ? "wasn't" : "weren't"} sent: ${parts.join("; ")}.`;
}

/** What the page says after a send. Counts only. */
export function reminderOutcome(r: { sent: number; failed: number; unknown?: number; remaining: number; skipped: Partial<Record<ReminderSkip, number>>; interrupted?: boolean }): string {
  const unknown = r.unknown ?? 0;
  const lines = [
    r.sent ? `Reminders to add their s18A details went to ${plural(r.sent, "donor")}.` : unknown ? "" : "No reminders were sent.",
    skippedSentence(r.skipped),
    r.failed ? `${plural(r.failed, "email")} couldn't be sent just now. Choose ${r.failed === 1 ? "that donor" : "them"} again later: nobody gets it twice.` : "",
    unknown ? `The connection dropped while sending ${unknown === 1 ? "1 reminder, so it" : `${unknown} reminders, so they`} may or may not have gone. To be safe, ${unknown === 1 ? "it isn't" : "they aren't"} sent again this week, so nobody gets two.` : "",
    r.interrupted ? "Sending stopped part way because of a problem on our side, not anything you did." : "",
    r.remaining ? `${plural(r.remaining, "donor")} still to send to: choose them again and press Send. Nobody gets it twice.` : "",
  ];
  return lines.filter(Boolean).join(" ");
}

/**
 * The reminder, in the charity's name and sent by Givezy. DRAFT WORDING for Yehuda and Yosef. Says only what is
 * missing, never an amount, a number or another donor. The link is the account page's "s18A details still needed",
 * the same place the payment confirmation sends donors who chose "Add my details after paying".
 */
export function s18aReminderEmail(
  to: string,
  v: { charityName: string; firstName: string | null; missing: MissingDetail[]; detailsUrl: string; stopUrl: string; replyTo: string | null; oneClickUrl?: string },
): EmailMessage {
  const name = cleanDedicationName(v.firstName);
  const what = missingWords(v.missing, "your");
  return {
    to,
    subject: `Your s18A receipt from ${v.charityName}: details still needed`,
    ...(v.replyTo ? { replyTo: v.replyTo } : {}),
    ...(v.oneClickUrl ? { headers: oneClickStopHeaders(v.oneClickUrl) } : {}),
    text: [
      name ? `Dear ${name},` : "Hello,",
      "",
      `Thank you for giving to ${v.charityName}. You asked for an s18A receipt, and to issue it we still need ${what}. SARS asks for ${v.missing.length > 1 ? "these" : "this"} on every s18A receipt.`,
      "",
      `Add ${v.missing.length > 1 ? "them" : "it"} here, signing in with the email address you gave when you donated:`,
      v.detailsUrl,
      "",
      "It takes a minute. Until then your gift can't go on your s18A receipt. Receipts are sent after the tax year ends on the last day of February.",
      "",
      `From ${v.charityName}`,
      "",
      "",
      v.replyTo ? `${v.charityName} sent this through Givezy. Reply to this email to reach them.` : `${v.charityName} sent this through Givezy.`,
      `You're getting this because you gave to ${v.charityName} on Givezy and asked for an s18A receipt. To stop emails from ${v.charityName}: ${v.stopUrl}`,
    ].join("\n"),
  };
}

/** The account page's "s18A details still needed" section. */
export function detailsUrl(site: string): string {
  return `${site.replace(/\/+$/, "")}/account#s18a-details`;
}
