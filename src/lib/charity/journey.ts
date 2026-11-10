/**
 * A charity's donor journey (CRM step 6a, Yossi 1.1, built 10/11/2026): up to five emails the charity writes, sent by
 * Givezy in its name, each a number of days after the one before. Decided by Yehuda 10/11/2026: new donors join on
 * their first paid gift (from when the journey is switched on); the owner can add existing donors, asked first; no
 * typed links (the thank-you note's rule), Givezy adds the button to the charity's page and the stop link; at most
 * five emails. One message a week per donor per charity across everything (09/11/2026): a step that meets a claimed
 * week waits until the next week, it is never skipped.
 *
 * Pure: no database, no clock (the caller passes "now"), no Node modules, so the editor's live preview runs it in the
 * browser and the rules can be tested.
 */
import { cleanDedicationName } from "@/lib/donations/dedication";
import type { EmailMessage } from "@/lib/email";
import { oneClickStopHeaders } from "@/lib/email/headers";
import { plural } from "@/lib/text";
import { saDate } from "./dashboard";
import { cleanThankYouNote, hasWebAddress } from "./thank-you-note";

export const JOURNEY_MAX_STEPS = 5;
export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 120;
export const BODY_MIN = 10;
export const BODY_MAX = 1500;
/** The first email: 0 to 30 days after the donor joins. */
export const FIRST_WAIT = { min: 0, max: 30 } as const;
/** Each later email: 7 to 180 days after the one before. */
export const WAIT = { min: 7, max: 180 } as const;
/** The most journey emails one daily run sends, across all charities: the rest go the next day. */
export const JOURNEY_RUN_CAP = 100;
/** The most new donors one daily run adds, across all charities. */
export const JOURNEY_ENROL_CAP = 500;

export type JourneyStep = { subject: string; body: string; waitDays: number };

/** Waits allowed for the step at this position (1-based). */
export function waitRange(position: number): { min: number; max: number } {
  return position === 1 ? FIRST_WAIT : WAIT;
}

/** One line, no hidden characters, single spaces. */
export function cleanSubject(raw: string | null | undefined): string {
  return (raw ?? "").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠⁦-⁩﻿]/g, " ").replace(/\s+/g, " ").trim();
}

export type StepErrors = Partial<Record<"subject" | "body" | "waitDays", string>>;
export type CheckedJourney = { ok: true; steps: JourneyStep[] } | { ok: false; message: string; errors: StepErrors[] };

/**
 * What the editor accepts: one to five emails, each with a subject, a few words and a wait in range, and no web
 * address anywhere (the button to the charity's page is Givezy's). The words are cleaned as the thank-you note is.
 */
export function checkJourneySteps(raw: { subject?: unknown; body?: unknown; waitDays?: unknown }[]): CheckedJourney {
  if (raw.length === 0) return { ok: false, message: "Add at least one email. Nothing was saved.", errors: [] };
  if (raw.length > JOURNEY_MAX_STEPS) return { ok: false, message: `A journey has at most ${JOURNEY_MAX_STEPS} emails. Nothing was saved.`, errors: [] };
  const errors: StepErrors[] = [];
  const steps: JourneyStep[] = [];
  raw.forEach((r, i) => {
    const e: StepErrors = {};
    const subject = cleanSubject(typeof r.subject === "string" ? r.subject : "");
    const body = cleanThankYouNote(typeof r.body === "string" ? r.body : "") ?? "";
    const waitText = String(r.waitDays ?? "").trim();
    const wait = /^\d{1,3}$/.test(waitText) ? Number(waitText) : NaN;
    const range = waitRange(i + 1);
    if (subject.length < SUBJECT_MIN) e.subject = "Give this email a subject.";
    else if (subject.length > SUBJECT_MAX) e.subject = `Keep the subject to ${SUBJECT_MAX} characters or fewer. It is ${subject.length} now.`;
    else if (hasWebAddress(subject)) e.subject = "Leave out web addresses: we add the button to your page ourselves.";
    if (body.length < BODY_MIN) e.body = "Write a few words for this email.";
    else if (body.length > BODY_MAX) e.body = `Keep it to ${BODY_MAX} characters or fewer. It is ${body.length} now.`;
    else if (hasWebAddress(body)) e.body = "Leave out web addresses: these emails can't carry links. We add a button to your page on Givezy ourselves.";
    if (!Number.isInteger(wait) || wait < range.min || wait > range.max) {
      e.waitDays = i === 0 ? `Choose ${range.min} to ${range.max} days after they join.` : `Choose ${range.min} to ${range.max} days after the email before.`;
    }
    errors.push(e);
    steps.push({ subject, body, waitDays: wait });
  });
  if (errors.some((e) => Object.keys(e).length)) {
    const bad = errors.map((e, i) => (Object.keys(e).length ? i + 1 : 0)).filter(Boolean);
    return { ok: false, message: `${bad.length === 1 ? `Email ${bad[0]} needs` : `Emails ${bad.join(", ")} need`} a change before it can be saved. Nothing was saved, and what you typed is still here.`, errors };
  }
  return { ok: true, steps };
}

/**
 * Starter wording a charity can begin from. DRAFT WORDING for Yosef: warm, no guilt, no numbers we can't stand behind.
 * The charity changes it to its own voice before switching the journey on.
 */
export const STARTER_STEPS: JourneyStep[] = [
  {
    waitDays: 2,
    subject: "Welcome, and thank you",
    body: "Thank you for your gift. It means a great deal to everyone here.\n\nWe wanted to say hello properly and tell you a little about who we are and why we do this work. Over the next few months we'll send you a few short notes about what your support makes possible. You can stop them at any time with the link at the bottom.",
  },
  {
    waitDays: 21,
    subject: "A little more about our work",
    body: "We'd love you to know more about the people behind our work and the people we serve.\n\nIf you ever have a question, or would like to visit or help in another way, reply to this email and someone from our team will get back to you.",
  },
  {
    waitDays: 45,
    subject: "Thank you for being part of this",
    body: "A few months ago you chose to support us. We haven't forgotten.\n\nYour page on Givezy has our latest news and photos. Thank you for being part of what we do.",
  },
];

/** Days later, as a moment. */
export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

/** The next Monday at 00:00 Johannesburg (+02:00, no daylight saving): when a claimed week frees up. */
export function nextWeekStart(now: Date): Date {
  const [y, m, d] = saDate(now).split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  const ahead = 7 - ((day.getUTCDay() + 6) % 7);
  day.setUTCDate(day.getUTCDate() + ahead);
  return new Date(`${day.toISOString().slice(0, 10)}T00:00:00+02:00`);
}

/** When a donor who joins at `joined` gets the first email. */
export function firstDue(joined: Date, steps: Pick<JourneyStep, "waitDays">[]): Date {
  return addDays(joined, steps[0]?.waitDays ?? 0);
}

/** After email `sent` (1-based) went at `at`: the next email and when, or null when that was the last. */
export function afterSend(sent: number, at: Date, steps: Pick<JourneyStep, "waitDays">[]): { nextStep: number; due: Date } | null {
  const next = steps[sent];
  return next ? { nextStep: sent + 1, due: addDays(at, next.waitDays) } : null;
}

export type StopReason = "erased" | "opted_out" | "no_email" | "no_gift";

/** One donor whose next email is due, and what the run found out about them. */
export type DueCandidate = {
  /** Still a donor of this charity with a paid gift on Givezy. */
  hasGift: boolean;
  erased: boolean;
  /** Their address from their latest paid gift on Givezy; null when they only have gifts the charity recorded. */
  email: string | null;
  optedOut: boolean;
  messagedThisWeek: boolean;
  nextStep: number;
};

export type DueDecision = { kind: "send" } | { kind: "wait_week" } | { kind: "finish" } | { kind: "stop"; reason: StopReason };

/** What to do with one due donor. The first that applies. */
export function decideDue(c: DueCandidate, stepCount: number): DueDecision {
  if (c.erased) return { kind: "stop", reason: "erased" };
  if (!c.hasGift) return { kind: "stop", reason: "no_gift" };
  if (!c.email) return { kind: "stop", reason: "no_email" };
  if (c.optedOut) return { kind: "stop", reason: "opted_out" };
  // The charity shortened its journey since: they have had every email it still has.
  if (c.nextStep > stepCount) return { kind: "finish" };
  if (c.messagedThisWeek) return { kind: "wait_week" };
  return { kind: "send" };
}

/**
 * New donors to add: the donor's first paid gift to this charity came while the journey was on (at or after
 * `switchedOnAt`), and they aren't on it already. `firstGift` maps each donor to their first paid gift's time.
 */
export function newJoiners(firstGift: ReadonlyMap<string, Date>, switchedOnAt: Date, already: ReadonlySet<string>): { donorId: string; joined: Date }[] {
  const out: { donorId: string; joined: Date }[] = [];
  for (const [donorId, at] of firstGift) if (at.getTime() >= switchedOnAt.getTime() && !already.has(donorId)) out.push({ donorId, joined: at });
  return out.sort((a, b) => a.joined.getTime() - b.joined.getTime() || a.donorId.localeCompare(b.donorId));
}

export const EXISTING_SKIPS = ["already", "erased", "opted_out", "recorded_only"] as const;
export type ExistingSkip = (typeof EXISTING_SKIPS)[number];
export type ExistingCandidate = { donorId: string; already: boolean; erased: boolean; email: string | null; optedOut: boolean };

/** "Add my existing donors": who joins, and why each other donor doesn't. One reason per donor, the first that applies. */
export function planExisting<T extends ExistingCandidate>(candidates: T[]): { add: T[]; skipped: Record<ExistingSkip, number> } {
  const skipped: Record<ExistingSkip, number> = { already: 0, erased: 0, opted_out: 0, recorded_only: 0 };
  const add: T[] = [];
  for (const c of candidates) {
    const why: ExistingSkip | null = c.already ? "already" : c.erased ? "erased" : !c.email ? "recorded_only" : c.optedOut ? "opted_out" : null;
    if (why) skipped[why]++;
    else add.push(c);
  }
  return { add, skipped };
}

const EXISTING_WORDS: Record<ExistingSkip, string> = {
  already: "already on your journey",
  erased: "had their details erased at their request",
  opted_out: "turned off emails from you",
  recorded_only: "have only gifts you recorded yourself, so Givezy can't email them",
};

/** "12 aren't added: 10 already on your journey; 2 turned off emails from you." Empty when none. */
export function existingSkippedSentence(skipped: Partial<Record<ExistingSkip, number>>): string {
  const parts = EXISTING_SKIPS.filter((k) => (skipped[k] ?? 0) > 0).map((k) => `${skipped[k]} ${EXISTING_WORDS[k]}`);
  if (!parts.length) return "";
  const total = EXISTING_SKIPS.reduce((a, k) => a + (skipped[k] ?? 0), 0);
  return `${total} ${total === 1 ? "isn't" : "aren't"} added: ${parts.join("; ")}.`;
}

/** Where each person on the journey is, for the page's counts. */
export type JourneyCounts = { waiting: number[]; finished: number; stopped: number; total: number };

export function journeyCounts(rows: { status: string; next_step: number }[], stepCount: number): JourneyCounts {
  const waiting = Array.from({ length: Math.max(stepCount, 1) }, () => 0);
  let finished = 0;
  let stopped = 0;
  for (const r of rows) {
    if (r.status === "stopped") stopped++;
    else if (r.status === "finished" || r.next_step > stepCount) finished++;
    else waiting[Math.max(1, r.next_step) - 1]++;
  }
  return { waiting, finished, stopped, total: rows.length };
}

export const STOP_WORDS: Record<StopReason, string> = {
  erased: "Details erased at their request",
  opted_out: "Turned off emails from you",
  no_email: "No email address on Givezy",
  no_gift: "No paid gift any more",
};

/** "Email 2 on 03/12/2026", "Finished", "Stopped: turned off emails from you". */
export function enrolmentLabel(r: { status: string; next_step: number; next_due_at: string; stopped_reason: string | null }, stepCount: number, formatDate: (d: string) => string): string {
  if (r.status === "stopped") return `Stopped: ${(STOP_WORDS[r.stopped_reason as StopReason] ?? "stopped").toLowerCase()}`;
  if (r.status === "finished" || r.next_step > stepCount) return "Had every email";
  return `Email ${r.next_step} due ${formatDate(r.next_due_at)}`;
}

/** The charity's page on Givezy: the one button in every journey email. */
export function charityPageUrl(site: string, slug: string): string {
  return `${site.replace(/\/+$/, "")}/c/${encodeURIComponent(slug)}`;
}

/** The label above the charity's words, so they are never mistaken for Givezy's. */
export function journeyHeading(charityName: string): string {
  return `From ${charityName.replace(/\s+/g, " ").trim()}`;
}

/**
 * One journey email, in the charity's name and sent by Givezy: the donor's first name, the charity's own words (in
 * their own box in the HTML, never turned into links), Givezy's button to the charity's page, and the stop link.
 * Never an amount, a gift or another donor.
 */
export function journeyEmail(
  to: string,
  v: { charityName: string; firstName: string | null; subject: string; body: string; pageUrl: string; stopUrl: string; replyTo: string | null; oneClickUrl?: string },
): EmailMessage {
  const name = cleanDedicationName(v.firstName);
  const body = cleanThankYouNote(v.body) ?? "";
  return {
    to,
    subject: cleanSubject(v.subject),
    ...(v.replyTo ? { replyTo: v.replyTo } : {}),
    ...(v.oneClickUrl ? { headers: oneClickStopHeaders(v.oneClickUrl) } : {}),
    quoted: { heading: journeyHeading(v.charityName), body, inText: body },
    text: [
      name ? `Dear ${name},` : "Hello,",
      "",
      body,
      "",
      `See our page on Givezy: ${v.pageUrl}`,
      "",
      "",
      v.replyTo ? `${v.charityName} sent this through Givezy. Reply to this email to reach them.` : `${v.charityName} sent this through Givezy.`,
      `You're getting this because you gave to ${v.charityName} on Givezy. To stop emails from ${v.charityName}: ${v.stopUrl}`,
    ].join("\n"),
  };
}

/** The line kept in the week's claim (and in the donor's own data download): which email, never the words. */
export function claimNote(position: number, subject: string): string {
  return `Donor journey email ${position}: ${cleanSubject(subject)}`.slice(0, 1000);
}

/** What the page says after "Add my existing donors". Counts only. */
export function existingOutcome(r: { added: number; skipped: Partial<Record<ExistingSkip, number>>; firstEmail: string | null }): string {
  return [
    r.added ? `${plural(r.added, "donor")} ${r.added === 1 ? "is" : "are"} on your journey now.${r.firstEmail ? ` Their first email goes from ${r.firstEmail}, never more than one message from you a week.` : ""}` : "Nobody new was added.",
    existingSkippedSentence(r.skipped),
  ].filter(Boolean).join(" ");
}
