/**
 * Emails from a charity to its donors: news and appeals (Yehuda, 21/10/2026). DRAFT WORDING for Yehuda
 * and Yosef. Pure helpers (tested): checking what was typed, choosing who it goes to, and the email itself.
 */
import { cleanDedicationName } from "@/lib/donations/dedication";
import type { EmailMessage } from "@/lib/email";
import { isDonorGroup, type DonorGroup } from "./insights";

export const APPEAL_SUBJECT_MAX = 120;
export const APPEAL_BODY_MAX = 5000;
/** At most this many emails from one charity to one donor in 30 days (the database enforces it too). */
export const APPEALS_PER_MONTH = 4;

const clean = (s: string) =>
  s
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, "")
    .trim();

export function checkAppeal(raw: { subject: unknown; body: unknown }):
  | { ok: true; subject: string; body: string }
  | { ok: false; fieldErrors: { subject?: string; body?: string } } {
  // A subject is one line.
  const subject = clean(String(raw.subject ?? "")).replace(/\s+/g, " ");
  const body = clean(String(raw.body ?? ""));
  const fieldErrors: { subject?: string; body?: string } = {};
  if (subject.length < 3) fieldErrors.subject = "Give your email a subject, for example: Winter parcels, how you helped";
  else if (subject.length > APPEAL_SUBJECT_MAX) fieldErrors.subject = `Keep the subject to ${APPEAL_SUBJECT_MAX} characters or fewer`;
  if (body.length < 10) fieldErrors.body = "Write your message: a few sentences is enough";
  else if (body.length > APPEAL_BODY_MAX) fieldErrors.body = `Keep it to ${APPEAL_BODY_MAX.toLocaleString("en-ZA").replace(/ |,/g, " ")} characters or fewer`;
  return fieldErrors.subject || fieldErrors.body ? { ok: false, fieldErrors } : { ok: true, subject, body };
}

/** Who an email is for: every donor, one group, one tag, a saved list, or the people who gave to a campaign. */
export type Audience =
  | { kind: "all" }
  | { kind: "group"; group: DonorGroup }
  | { kind: "tag"; tagId: string }
  | { kind: "segment"; segmentId: string }
  | { kind: "campaign"; campaignId: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The audience as chosen in the form ("all", "group:lapsed", "tag:<id>", "segment:<id>", "campaign:<id>"). */
export function parseAudience(v: unknown): Audience | null {
  const s = String(v ?? "");
  if (s === "all") return { kind: "all" };
  const [kind, id] = s.split(":");
  if (kind === "group" && isDonorGroup(id)) return { kind: "group", group: id };
  if (!uuid.test(id ?? "")) return null;
  if (kind === "tag") return { kind: "tag", tagId: id.toLowerCase() };
  if (kind === "segment") return { kind: "segment", segmentId: id.toLowerCase() };
  if (kind === "campaign") return { kind: "campaign", campaignId: id.toLowerCase() };
  return null;
}

export function audienceValue(a: Audience): string {
  switch (a.kind) {
    case "all": return "all";
    case "group": return `group:${a.group}`;
    case "tag": return `tag:${a.tagId}`;
    case "segment": return `segment:${a.segmentId}`;
    case "campaign": return `campaign:${a.campaignId}`;
  }
}

/** The first name to greet a donor by: a person's first name; nothing for a company or trust. */
export function greetingName(d: { donor_type: string; display_name: string }): string | null {
  if (d.donor_type !== "individual") return null;
  return cleanDedicationName(d.display_name.trim().split(/\s+/)[0] ?? null);
}

/** One donor's copy. Their first name and the charity's words only: never amounts or other donors. */
export function appealEmail(
  to: string,
  v: { charityName: string; firstName: string | null; subject: string; body: string; stopUrl: string; replyTo: string | null },
): EmailMessage {
  return {
    to,
    subject: v.subject,
    ...(v.replyTo ? { replyTo: v.replyTo } : {}),
    text: [
      v.firstName ? `Dear ${v.firstName},` : "Hello,",
      "",
      v.body,
      "",
      `From ${v.charityName}`,
      "",
      "",
      v.replyTo ? `${v.charityName} sent this through Givezy. Reply to this email to reach them.` : `${v.charityName} sent this through Givezy.`,
      `You're getting this because you gave to ${v.charityName} on Givezy. To stop news and appeals from ${v.charityName}: ${v.stopUrl}`,
    ].join("\n"),
  };
}
