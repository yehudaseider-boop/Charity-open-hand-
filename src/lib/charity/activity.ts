/**
 * The charity's activity, in plain words (team roles, CRM step 9, 10/11/2026): who did what, and when, for example
 * "Sarah approved the s18A receipt for Thandi M. on 03/03/2027". Built from the dashboard's own action records
 * (charity_actions) and, for what has no action record (downloads and the SARS files), the audit log. Pure: the page
 * reads the rows. A donor's name is shortened to a first name and an initial; no amounts, ID or contact details.
 */
import { formatDate, taxYearName } from "@/lib/dates";
import { ROLE_LABEL, isRole } from "./permissions";
import { journeyName, parseRefKey } from "./journey";

type Details = Record<string, unknown>;

export type ActionEntry = { kind: string; details: Details; userId: string | null; at: string; undoneAt: string | null };
export type AuditEntry = { action: string; details: Details; userId: string | null; at: string };
export type ActivityLine = { at: string; text: string };

/** "Thandi Mokoena" becomes "Thandi M."; one word stays as it is; nothing becomes "a donor". */
export function shortName(name: unknown): string {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "a donor";
  if (words.length === 1) return words[0];
  return `${words[0]} ${words[words.length - 1].charAt(0).toUpperCase()}.`;
}

const quoted = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? `"${v.trim()}"` : fallback);
const roleText = (r: unknown) => (isRole(r) ? `${/^[aeiou]/i.test(ROLE_LABEL[r]) ? "an" : "a"} ${ROLE_LABEL[r].toLowerCase()}` : "a team member");
/** "the donor journey", "the win-back journey", "the journey for Winter blankets" (older records: the donor journey). */
const journeyLabel = (d: Record<string, unknown>) => journeyName(parseRefKey(d.jkey)?.kind ?? "general", typeof d.jtitle === "string" ? d.jtitle : null).replace(/^your /, "the ");
const year = (v: unknown) => (Number.isInteger(Number(v)) && Number(v) > 2000 ? ` for the ${taxYearName(Number(v))} tax year` : "");

/** What a dashboard action did, after the person's name. Unknown kinds get a neutral line rather than nothing. */
export function actionPhrase(kind: string, d: Details): string {
  switch (kind) {
    case "profile_saved": return "saved the public profile";
    case "logo_changed": return "changed the logo";
    case "cover_changed": return "changed the cover image";
    case "video_saved": return "saved the profile video";
    case "video_removed": return "removed the profile video";
    case "focus_saved": return "saved the focus card";
    case "focus_removed": return "removed the focus card";
    case "donation_emails_on": return "switched on emails about new gifts";
    case "donation_emails_off": return "switched off emails about new gifts";
    case "campaign_started": return `started the campaign ${quoted(d.title, "")}`.trimEnd();
    case "campaign_ended": return `ended the campaign ${quoted(d.title, "")}`.trimEnd();
    case "update_posted": return "posted an update";
    case "update_removed": return "removed an update";
    case "photo_added": return "added a photo";
    case "photo_removed": return "removed a photo";
    case "organisation_saved": return "saved the organisation details";
    case "address_saved": return "saved the address";
    case "contact_saved": return "changed the charity's contact details";
    case "bank_saved": return "changed the bank account";
    case "document_uploaded": return "uploaded a document";
    case "document_removed": return "removed a document";
    case "application_submitted": return "sent the application to Givezy";
    case "thank_you_sent": return "sent the monthly thank-you";
    case "thank_you_wording_saved": return "changed the thank-you note";
    case "donor_thanked": return `thanked ${shortName(d.name)}`;
    case "receipts_approved": return `approved the s18A receipts${year(d.taxYear)}`;
    case "gift_recorded": return "recorded a gift";
    case "gifts_imported": return "imported gifts from a file";
    case "gifts_removed": return "removed recorded gifts";
    case "member_added": return `gave ${String(d.email ?? "someone")} access${isRole(d.role) ? ` as ${roleText(d.role)}` : ""}`;
    case "member_removed": return `removed ${String(d.email ?? "someone")} from the team`;
    case "role_changed": return `made ${String(d.email ?? "someone")} ${roleText(d.to)} (was ${roleText(d.from)})`;
    case "appeal_sent": return `emailed donors ${quoted(d.subject, "an update")}`;
    case "contacts_imported": return "imported donor contacts";
    case "contacts_removed": return "removed imported donor contacts";
    case "sars_details_saved": return "changed the SARS details";
    case "certificate_approved": return `approved the s18A receipt for ${shortName(d.name)}`;
    case "certificate_edited": return `corrected and approved the s18A receipt for ${shortName(d.name)}`;
    case "certificate_declined": return `declined the s18A receipt for ${shortName(d.name)}`;
    case "certificate_reopened": return `reopened the s18A receipt for ${shortName(d.name)}`;
    case "s18a_reminders_sent": return "sent reminders to add s18A details";
    case "journey_saved": return `saved ${journeyLabel(d)}`;
    case "journey_on": return `switched on ${journeyLabel(d)}`;
    case "journey_off": return `switched off ${journeyLabel(d)}`;
    case "journey_existing_added": return "added existing donors to the donor journey";
    case "journey_winback_added": return "added donors to the win-back journey";
    default: return "made a change";
  }
}

/** The audit log events the activity shows (those with no dashboard action record of their own). */
export const AUDIT_SHOWN: Record<string, string> = {
  "charity.donors_exported": "downloaded the donor list",
  "charity.donations_exported": "downloaded the donations",
  "charity.report_exported": "downloaded the annual report figures",
  "charity.keeping_donors_exported": "downloaded a keeping-donors list",
  "charity.stopped_monthly_exported": "downloaded the stopped monthly donors",
  "charity.deposits_exported": "downloaded the deposits",
  "charity.receipt_year_list_exported": "downloaded a year's s18A receipt list",
  "charity.it3d_file_downloaded": "downloaded the SARS IT3(d) data file",
  "charity.it3d_capture_sheet_downloaded": "downloaded the SARS IT3(d) capture sheet",
  "charity.it3d_marked_uploaded": "marked an IT3(d) file as uploaded to SARS",
  "charity.it3d_mark_removed": "took off an IT3(d) file's uploaded mark",
};

/** One readable line: "Sarah approved the s18A receipt for Thandi M. on 03/03/2027". */
export function sentence(who: string, phrase: string, at: string, undone = false): string {
  return `${who} ${phrase} on ${formatDate(at)}${undone ? ", then took it back" : ""}.`;
}

/** Everything, newest first, at most `limit` lines. `nameOf` gives a person's name (or "Someone"). */
export function activityLines(actions: ActionEntry[], audits: AuditEntry[], nameOf: (userId: string | null) => string, limit = 100): ActivityLine[] {
  const lines: ActivityLine[] = [
    ...actions.map((a) => ({ at: a.at, text: sentence(nameOf(a.userId), actionPhrase(a.kind, a.details), a.at, Boolean(a.undoneAt)) })),
    ...audits.filter((a) => a.action in AUDIT_SHOWN).map((a) => ({ at: a.at, text: sentence(nameOf(a.userId), AUDIT_SHOWN[a.action], a.at) })),
  ];
  return lines.sort((x, y) => y.at.localeCompare(x.at)).slice(0, limit);
}

/** A team member's name for the activity: their name if they gave one, else their email address, else "Someone". */
export function displayName(p: { full_name?: string | null; email?: string | null } | undefined): string {
  const name = p?.full_name?.trim();
  if (name) return name;
  const email = p?.email?.trim();
  return email || "Someone";
}
