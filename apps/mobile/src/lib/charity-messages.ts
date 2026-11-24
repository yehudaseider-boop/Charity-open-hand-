import { postedWhen } from "./charity-news";

/**
 * "From your charities" (24/11/2026, Yehuda: donors see a charity's thank-you "inside the Givezy app (a message in the
 * app, no phone push notification)"). A charity's thank-you, sent from its dashboard by a person on its team, reaches
 * a donor who uses the app by email and here. Only donors whose email went get it, so the same "stop these emails"
 * choice covers both. Pure, so it is tested without a phone.
 */

export type CharityMessage = {
  id: string;
  charityName: string;
  /** The charity's page in the app, when it is listed. */
  slug: string | null;
  subject: string;
  body: string;
  sentAt: Date;
  read: boolean;
};

/** A row as the database gives it (donor_messages with the charity's name), read through row-level security. */
export type MessageRow = {
  id: string;
  subject: string;
  body: string;
  sent_at: string;
  read_at: string | null;
  charities: { name_en: string; slug: string } | { name_en: string; slug: string }[] | null;
};

/** How many Home shows; the rest are on the Messages page. */
export const HOME_MESSAGES = 2;
/** How many are read at once (newest first). */
export const MESSAGES_LIMIT = 50;
/** A long message is shortened on Home and in the list until "Read all" is pressed. */
export const SHORT_LINES = 4;

/** Whether a message is longer than the shortened view (about 40 characters a line on a phone, or several paragraphs). */
export function isLongMessage(body: string): boolean {
  return body.length > SHORT_LINES * 40 || body.split("\n").length > SHORT_LINES;
}

export function toMessages(rows: MessageRow[]): CharityMessage[] {
  return rows
    .map((r) => {
      const c = Array.isArray(r.charities) ? (r.charities[0] ?? null) : r.charities;
      return {
        id: r.id,
        charityName: c?.name_en?.trim() || "A charity you gave to",
        slug: c?.slug ?? null,
        subject: r.subject.trim(),
        body: r.body.trim(),
        sentAt: new Date(r.sent_at),
        read: r.read_at !== null,
      };
    })
    .filter((m) => m.body.length > 0 && !Number.isNaN(m.sentAt.getTime()))
    .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
}

export function unreadCount(messages: CharityMessage[]): number {
  return messages.filter((m) => !m.read).length;
}

/** "Today", "Yesterday" or dd/mm/yyyy, as for news. */
export function sentWhen(m: CharityMessage, today: Date): string {
  return postedWhen(m.sentAt, today);
}

/** Marks one read in a list (what the screen shows straight away, before the server answers). */
export function markedRead(messages: CharityMessage[], id: string): CharityMessage[] {
  return messages.map((m) => (m.id === id ? { ...m, read: true } : m));
}

/** Whether the table isn't there yet (the database change hasn't run): then there are simply no messages. */
export function isMissingTable(e: { code?: string } | null | undefined): boolean {
  return e?.code === "PGRST205" || e?.code === "42P01";
}
