/**
 * "Request a charity" (Yehuda, 15/11/2026): a donor who can't find their charity asks us to add it, on the website's
 * Find a charity page or in the app's Discover. They give the charity's name (the only thing needed), where it is, a
 * website or social link and a note. If they tick the box, we email them once, when it joins; that email address is
 * used for nothing else and is deleted once that email has gone (or when we decide not to add the charity).
 *
 * New personal data (POPIA), so it stays switched off (`appLinks.charityRequestsOpen`) until the table (migration
 * 20261115000001_charity_requests.sql) is on the database with Yehuda's yes. Pure and dependency-free: the phone app
 * shares it (`@shared/charity-requests`).
 */

/** DRAFT WORDING for Yosef. The version is stored with every email, so we can always say what was agreed. */
export const CHARITY_REQUEST_CONSENT = {
  version: "charity-request-2026-11-15",
  label: "Email me when it joins",
  text: "We'll email you once if this charity joins Givezy within a month. We use your email for nothing else, and delete it once that email has gone, or after a month.",
} as const;

/**
 * How long an email waits on a request for a charity that hasn't joined (Yehuda, 15/11/2026: "a month"): one
 * calendar month from the request. Then it is deleted unused by the daily job; the request itself stays for Admin.
 */
export const CHARITY_REQUEST_EMAIL_MONTHS = 1;

/** The moment before which an unused email is deleted: one calendar month back (31/03 goes to 28/02 or 29/02). */
export function emailKeptSince(now: Date, months = CHARITY_REQUEST_EMAIL_MONTHS): Date {
  const d = new Date(now.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

export const CHARITY_REQUEST_LIMITS = {
  name: 120,
  town: 80,
  link: 300,
  note: 500,
  email: 254,
  /** How many requests one internet address may send in an hour. */
  perHour: { tries: 5, minutes: 60 },
} as const;

export const CHARITY_REQUEST_MESSAGES = {
  closed: "Requests aren't open yet. Nothing was sent. Please come back soon.",
  tooMany: "Too many requests from here. Nothing was sent. Please try again in an hour.",
  failed: "We couldn't send your request just now. Nothing was sent, and what you typed is still here. Please try again.",
  offline: "You're offline, so nothing was sent. What you typed is still here. Check your connection and try again.",
  unreachable: "We couldn't reach Givezy, so nothing was sent. What you typed is still here. Please try again in a moment.",
} as const;

/** The answer after a request is sent, worded for whether they asked to hear back. */
export function requestSentMessage(name: string, emailMe: boolean): string {
  return emailMe
    ? `Thank you. We'll ask ${name} to join Givezy, and email you once if they join within a month.`
    : `Thank you. We'll ask ${name} to join Givezy.`;
}

export type CharityRequestInput = {
  name: string;
  town: string | null;
  link: string | null;
  note: string | null;
  /** Only when they ticked "Email me when it joins". */
  notifyEmail: string | null;
};

export type CharityRequestCheck =
  | { ok: true; request: CharityRequestInput }
  | { ok: false; message: string; fieldErrors: Partial<Record<"name" | "town" | "link" | "note" | "email", string>> };

/** Trimmed, with runs of spaces (and line breaks, where they don't belong) made single. */
const oneLine = (raw: unknown) => String(raw ?? "").replace(/\s+/g, " ").trim();
const paragraph = (raw: unknown) => String(raw ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

/**
 * A website or social link as typed: "facebook.com/ourcharity" gets https:// in front. Only http and https links,
 * with a dot in the host, no spaces. Null for anything else.
 */
export function cleanLink(raw: unknown): string | null {
  const typed = oneLine(raw);
  if (!typed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : `https://${typed.replace(/^\/+/, "")}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".") || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** The same email check as the launch list: trimmed, lower case, a plain address with no spaces. */
export function cleanEmail(raw: unknown): string | null {
  const email = oneLine(raw).toLowerCase();
  if (!email || email.length > CHARITY_REQUEST_LIMITS.email) return null;
  return /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i.test(email) ? email : null;
}

/** Reads the form: the name is needed; everything else is optional, and the email only when the box is ticked. */
export function checkCharityRequest(raw: { name?: unknown; town?: unknown; link?: unknown; note?: unknown; emailMe?: unknown; email?: unknown }): CharityRequestCheck {
  const L = CHARITY_REQUEST_LIMITS;
  const fieldErrors: Partial<Record<"name" | "town" | "link" | "note" | "email", string>> = {};
  const name = oneLine(raw.name);
  const town = oneLine(raw.town);
  const linkTyped = oneLine(raw.link);
  const note = paragraph(raw.note);
  const emailMe = raw.emailMe === true || raw.emailMe === "on" || raw.emailMe === "yes";

  if (!name) fieldErrors.name = "Enter the charity's name.";
  else if (name.length < 2) fieldErrors.name = "That name looks too short. Check it and try again.";
  else if (name.length > L.name) fieldErrors.name = `Keep the name under ${L.name} characters.`;
  if (town.length > L.town) fieldErrors.town = `Keep the town or area under ${L.town} characters.`;
  const link = cleanLink(linkTyped);
  if (linkTyped && !link) fieldErrors.link = "That doesn't look like a web address. Check it, or leave it empty.";
  else if (link && link.length > L.link) fieldErrors.link = `Keep the link under ${L.link} characters.`;
  if (note.length > L.note) fieldErrors.note = `Keep the note under ${L.note} characters (it has ${note.length}).`;
  let notifyEmail: string | null = null;
  if (emailMe) {
    const typed = oneLine(raw.email);
    notifyEmail = cleanEmail(typed);
    if (!typed) fieldErrors.email = "Enter your email address, or untick the box.";
    else if (!notifyEmail) fieldErrors.email = "That doesn't look like an email address. Check it and try again.";
  }

  const first = Object.values(fieldErrors)[0];
  if (first) return { ok: false, message: Object.keys(fieldErrors).length > 1 ? "A few things need a look. Nothing was sent yet." : first, fieldErrors };
  return { ok: true, request: { name, town: town || null, link, note: note || null, notifyEmail } };
}

/** Requests for the same charity are grouped by this: lower case, single spaces, no punctuation, no "the". */
export function requestKey(name: string): string {
  const key = oneLine(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/^the /, "")
    .trim();
  // Some letters spell out longer when made plain: never longer than the database allows.
  return key.slice(0, 120).trim();
}


/** The one email a donor agreed to: the charity they asked for has joined. Only our own words and the charity's name. */
export function joinedEmail(charityName: string, charityUrl: string): { subject: string; text: string } {
  return {
    subject: `${charityName} has joined Givezy`,
    text: [
      `You asked us to add a charity, and ticked "Email me when it joins".`,
      "",
      `${charityName} is now on Givezy. We checked them before they could take a gift. You can find them here:`,
      charityUrl,
      "",
      "As promised, we've now deleted your email address from your request. This is the only email you'll get about it.",
      "",
      "Givezy",
    ].join("\n"),
  };
}

/** A filled-in hidden field means a bot: say "sent" and save nothing. */
export function isBot(honeypot: unknown): boolean {
  return typeof honeypot === "string" && honeypot.trim().length > 0;
}

export type CharityRequestStatus = "new" | "invited" | "joined" | "declined";
export const REQUEST_STATUS_LABEL: Record<CharityRequestStatus, string> = {
  new: "New",
  invited: "Invited",
  joined: "Joined",
  declined: "Not adding",
};

export type RequestRow = {
  name: string;
  name_key: string;
  town: string | null;
  link: string | null;
  note: string | null;
  /** The address to tell, if they ticked the box (server only: counted, never shown). */
  email: string | null;
  status: CharityRequestStatus;
  created_at: string;
};

export type RequestGroup = {
  key: string;
  /** The spelling most people used (the latest, on a tie). */
  name: string;
  asks: number;
  /** Different addresses waiting for the email (someone who asked twice counts once). */
  wantEmail: number;
  /** "invited" once any of them is; otherwise "new". */
  status: "new" | "invited";
  towns: string[];
  links: string[];
  notes: string[];
  firstAt: string;
  lastAt: string;
};

/** Open requests (new or invited) grouped by charity: most asked first, then the most recent. For Admin. */
export function groupRequests(rows: RequestRow[]): RequestGroup[] {
  const byKey = new Map<string, RequestRow[]>();
  for (const r of rows) {
    if (r.status !== "new" && r.status !== "invited") continue;
    byKey.set(r.name_key, [...(byKey.get(r.name_key) ?? []), r]);
  }
  const distinct = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];
  const groups = [...byKey.entries()].map(([key, rs]): RequestGroup => {
    const sorted = [...rs].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const spellings = new Map<string, number>();
    for (const r of sorted) spellings.set(r.name, (spellings.get(r.name) ?? 0) + 1);
    const name = [...spellings.entries()].reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];
    return {
      key,
      name,
      asks: rs.length,
      wantEmail: new Set(rs.map((r) => r.email?.trim().toLowerCase()).filter(Boolean)).size,
      status: rs.some((r) => r.status === "invited") ? "invited" : "new",
      towns: distinct(sorted.map((r) => r.town)).slice(0, 5),
      links: distinct(sorted.map((r) => r.link)).slice(0, 5),
      notes: distinct(sorted.map((r) => r.note)).slice(0, 5),
      firstAt: sorted[sorted.length - 1].created_at,
      lastAt: sorted[0].created_at,
    };
  });
  return groups.sort((a, b) => b.asks - a.asks || b.lastAt.localeCompare(a.lastAt));
}
