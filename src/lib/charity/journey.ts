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
/** Each charity's fair share of a run starts here; what one charity doesn't use goes to the others. */
export const JOURNEY_MIN_SHARE = 5;
/** Tries at one email before the donor is stopped ('not_delivered'). */
export const MAX_ATTEMPTS = 4;
/** An email logged as "sending" this long ago, and never confirmed, is treated as unknown: it may have gone. */
export const STALE_SENDING_MINUTES = 30;
/** One email's time limit. A send cut off by it may have gone, so it is never sent again. */
export const SEND_TIMEOUT_MS = 8_000;

/**
 * After an email didn't go (refused, or an address the test site may not email): try again in 1, then 3, then 7
 * days; after MAX_ATTEMPTS tries the donor stops, so a row that never sends can't hold up everyone else's.
 */
export function afterFailure(attemptsBefore: number, now: Date): { stop: true } | { stop: false; attempts: number; due: Date } {
  const attempts = attemptsBefore + 1;
  if (attempts >= MAX_ATTEMPTS) return { stop: true };
  return { stop: false, attempts, due: addDays(now, [1, 3, 7][attempts - 1] ?? 7) };
}

/**
 * An email already logged for this donor and step (the log row is written before the send). Sent: move on. Still
 * "sending" a while later: it may have gone, so it is marked unknown and the donor moves on, never sent twice (a lost
 * email is better than a double one). Sending just now: another run has it; leave it.
 */
export function existingSendAction(row: { status: string; created_at: string }, now: Date): "advance" | "mark_unknown" | "leave" {
  if (row.status === "sent" || row.status === "unknown") return "advance";
  return now.getTime() - new Date(row.created_at).getTime() >= STALE_SENDING_MINUTES * 60_000 ? "mark_unknown" : "leave";
}

/**
 * How many of a run's emails each charity gets: round by round, one each, until the cap or everyone's due list is
 * used up. A charity with thousands due can't crowd out the others.
 */
export function fairShares(due: ReadonlyMap<string, number>, cap: number): Map<string, number> {
  const out = new Map([...due.keys()].map((k) => [k, 0]));
  let left = cap;
  let progress = true;
  while (left > 0 && progress) {
    progress = false;
    for (const [k, n] of due) {
      if (left <= 0) break;
      if (out.get(k)! < n) {
        out.set(k, out.get(k)! + 1);
        left--;
        progress = true;
      }
    }
  }
  return out;
}

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

/**
 * Campaign journeys and the win-back journey (CRM steps 6b and 7, Yehuda 10/11/2026, "do this"). A charity has its
 * general journey (everyone's first gift), one journey per campaign it chooses (a first gift to that campaign) and one
 * win-back journey (donors the owner adds from the stopped monthly and keeping-donors lists). The same rules for all:
 * up to five emails, no typed links, one message a week per donor per charity across everything.
 */
export type JourneyKind = "general" | "campaign" | "winback";
export type JourneyRef = { kind: "general" } | { kind: "winback" } | { kind: "campaign"; campaignId: string };
export const GENERAL: JourneyRef = { kind: "general" };
export const WINBACK: JourneyRef = { kind: "winback" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How a journey is named in a link: "general", "winback" or "campaign:<id>". */
export function refKey(ref: JourneyRef): string {
  return ref.kind === "campaign" ? `campaign:${ref.campaignId}` : ref.kind;
}

/** A link's journey, or null when it names none (a made-up campaign id is checked against the charity's own later). */
export function parseRefKey(raw: unknown): JourneyRef | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "" || s === "general") return GENERAL;
  if (s === "winback") return WINBACK;
  const m = /^campaign:(.+)$/.exec(s);
  return m && UUID.test(m[1]) ? { kind: "campaign", campaignId: m[1].toLowerCase() } : null;
}

export function sameRef(a: JourneyRef, b: JourneyRef): boolean {
  return refKey(a) === refKey(b);
}

/** "your donor journey", "your win-back journey", "the journey for Winter blankets". */
export function journeyName(kind: JourneyKind, campaignTitle?: string | null): string {
  if (kind === "winback") return "your win-back journey";
  if (kind === "campaign") return `the journey for ${(campaignTitle ?? "").replace(/\s+/g, " ").trim() || "your campaign"}`;
  return "your donor journey";
}

/** The same, starting a sentence. */
export function journeyTitle(kind: JourneyKind, campaignTitle?: string | null): string {
  const n = journeyName(kind, campaignTitle);
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/**
 * Starter wording for a campaign's journey. DRAFT WORDING for Yosef: warm, no guilt, no numbers we can't stand
 * behind. The campaign's name is the charity's own.
 */
export function campaignStarterSteps(campaignTitle: string): JourneyStep[] {
  const t = campaignTitle.replace(/\s+/g, " ").trim() || "our campaign";
  return [
    {
      waitDays: 2,
      subject: "Thank you for supporting our campaign",
      body: `Thank you for giving to ${t}. It means a great deal to everyone here.\n\nWe'll send you a few short notes about how the campaign is going and what your support makes possible. You can stop them at any time with the link at the bottom.`,
    },
    {
      waitDays: 21,
      subject: "How the campaign is going",
      body: `We wanted to tell you how ${t} is going. Our page on Givezy has the latest news and photos.\n\nIf you have a question, reply to this email and someone from our team will get back to you.`,
    },
  ];
}

/**
 * Starter wording for the win-back journey. DRAFT WORDING for Yosef: warm, no guilt, no pressure, no numbers. These
 * donors gave before and haven't lately: the emails say thank you and keep the door open, they don't ask why.
 */
export const WINBACK_STARTER_STEPS: JourneyStep[] = [
  {
    waitDays: 1,
    subject: "Thank you for what you gave",
    body: "We wanted to say thank you again for supporting us in the past. Your gifts made a real difference to the people we serve.\n\nWe'd love to keep you up to date with what we're doing now. You can stop these notes at any time with the link at the bottom.",
  },
  {
    waitDays: 30,
    subject: "What we've been doing",
    body: "Here's a little news from us. Our page on Givezy has our latest updates and photos.\n\nIf you ever have a question, or would like to help in another way, reply to this email and someone from our team will get back to you.",
  },
];

/** The starter for a kind of journey. */
export function starterSteps(kind: JourneyKind, campaignTitle?: string | null): JourneyStep[] {
  if (kind === "winback") return WINBACK_STARTER_STEPS;
  if (kind === "campaign") return campaignStarterSteps(campaignTitle ?? "");
  return STARTER_STEPS;
}

/** A win-back donor gave again (any gift that went through, after they joined): they leave the win-back journey. */
export function gaveAgain(enrolledAt: Date, lastPaidAt: Date | null): boolean {
  return Boolean(lastPaidAt && lastPaidAt.getTime() > enrolledAt.getTime());
}

/** The most donors one press of "Add to win-back journey" takes, and the presses a day. */
export const WINBACK_PRESS_CAP = 100;
export const WINBACK_PRESSES_PER_DAY = 5;

/** The donors chosen on a list, cleaned: real ids only, each once, at most the cap; how many were over it. */
export function chosenDonors(raw: unknown[], cap = WINBACK_PRESS_CAP): { ids: string[]; over: number } {
  const ids = [...new Set(raw.filter((v): v is string => typeof v === "string" && UUID.test(v.trim())).map((v) => v.trim().toLowerCase()))];
  return { ids: ids.slice(0, cap), over: Math.max(0, ids.length - cap) };
}

/** "Add to win-back journey": who joins and why each other donor doesn't, as for existing donors. */
export function planWinback<T extends ExistingCandidate>(candidates: T[]) {
  return planExisting(candidates);
}

/** What the page says after adding donors to the win-back journey. Counts only. */
export function winbackOutcome(r: { added: number; skipped: Partial<Record<ExistingSkip, number>>; firstEmail: string | null }): string {
  return [
    r.added ? `${plural(r.added, "donor")} ${r.added === 1 ? "is" : "are"} on your win-back journey now.${r.firstEmail ? ` Their first email goes from ${r.firstEmail}, never more than one message from you a week. Anyone who gives again leaves it.` : ""}` : "Nobody new was added.",
    existingSkippedSentence(r.skipped),
  ].filter(Boolean).join(" ");
}

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

export type StopReason = "erased" | "opted_out" | "no_email" | "no_gift" | "not_delivered" | "gave_again";

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
  not_delivered: "Emails couldn't be delivered",
  gave_again: "Gave again, so they left your win-back journey",
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
