import { plural } from "@/lib/text";
import { reviewWithin } from "@/lib/charity/review-time";
import { taxYearName } from "@/lib/dates";
import { REMINDER_SKIPS, reminderOutcome } from "@/lib/charity/s18a-reminder";
import { WEEKLY_LIMIT } from "@/lib/charity/weekly-limit-rule";
import { EXISTING_SKIPS, existingOutcome } from "@/lib/charity/journey";

/** "2026/27" from a stored tax year, or empty when it is missing. */
const yearName = (y: unknown) => (Number.isInteger(Number(y)) && Number(y) > 2000 ? taxYearName(Number(y)) : "");
/**
 * The charity dashboard's core flow (18/10/2026, Yehuda): after every action, say what just happened,
 * offer to take it back, and point to what to do next. All the words live here, so they can be
 * changed in one place. Pure: no database, no clock (the caller passes "now").
 */

/** How long an action can be taken back. */
export const UNDO_MINUTES = 30;

export type ActionKind =
  | "profile_saved"
  | "logo_changed"
  | "cover_changed"
  | "video_saved"
  | "video_removed"
  | "focus_saved"
  | "focus_removed"
  | "donation_emails_on"
  | "donation_emails_off"
  | "campaign_started"
  | "campaign_ended"
  | "update_posted"
  | "update_removed"
  | "photo_added"
  | "photo_removed"
  | "organisation_saved"
  | "address_saved"
  | "contact_saved"
  | "bank_saved"
  | "document_uploaded"
  | "document_removed"
  | "application_submitted"
  | "thank_you_sent"
  | "thank_you_wording_saved"
  | "donor_thanked"
  | "receipts_approved"
  | "gift_recorded"
  | "gifts_imported"
  | "gifts_removed"
  | "member_added"
  | "member_removed"
  | "appeal_sent"
  | "contacts_imported"
  | "contacts_removed"
  | "sars_details_saved"
  | "certificate_approved"
  | "certificate_edited"
  | "certificate_declined"
  | "certificate_reopened"
  | "s18a_reminders_sent"
  | "journey_saved"
  | "journey_on"
  | "journey_off"
  | "journey_existing_added";

/** Actions that can never be taken back: the dashboard asks first instead (Yehuda, 18/10/2026). */
export const ASK_FIRST: ActionKind[] = ["application_submitted", "thank_you_sent", "donor_thanked", "gifts_removed", "member_removed", "appeal_sent", "contacts_removed", "certificate_declined", "s18a_reminders_sent"];

export type Details = Record<string, string | number | boolean | null | undefined>;
export type Context = { base: string; publicUrl: string | null; approved: boolean };
export type Done = { what: string; next: { label: string; href: string } | null };

const quote = (s: unknown) => `"${String(s ?? "").trim() || "it"}"`;

function seePage(c: Context, otherwise: { label: string; href: string }) {
  return c.approved && c.publicUrl ? { label: "See your page as donors see it", href: c.publicUrl } : otherwise;
}

/** What just happened, and the one next step, for an action that went through. */
export function describeDone(kind: ActionKind, d: Details, c: Context): Done {
  const app = (step: string) => `${c.base}/application?step=${step}`;
  switch (kind) {
    case "profile_saved":
      return {
        what: c.approved ? "Your public profile is saved. Donors see the changes now." : "Your public profile is saved. Donors see it once your application is approved.",
        next: seePage(c, { label: "Next: add photos and an update", href: `${c.base}/updates` }),
      };
    case "thank_you_wording_saved":
      return {
        what: d.cleared
          ? "Back to Givezy's wording. The thank-you email after each gift no longer carries a note from you."
          : "Your thank-you note is saved. Donors see it in the thank-you email after each gift from now on, and wherever we thank them for a gift.",
        next: { label: "See your donors", href: `${c.base}/donors` },
      };
    case "logo_changed":
      return { what: "Your new logo is up.", next: seePage(c, { label: "Back to your public profile", href: `${c.base}/profile` }) };
    case "cover_changed":
      return { what: "Your new cover image is up.", next: seePage(c, { label: "Back to your public profile", href: `${c.base}/profile` }) };
    case "video_saved":
      return {
        what: c.approved
          ? `Your video is on your page. Nothing loads from ${String(d.site ?? "the video site")} until a visitor presses play.`
          : "Your video is saved. Donors see it once your application is approved.",
        next: seePage(c, { label: "Back to your public profile", href: `${c.base}/profile` }),
      };
    case "video_removed":
      return { what: "Your video is removed from your page and from the app.", next: seePage(c, { label: "Back to your public profile", href: `${c.base}/profile` }) };
    case "focus_saved": {
      const days = `${String(d.from ?? "")} to ${String(d.to ?? "")}`;
      const when = d.status === "showing" ? `It shows at the top of your page and in the Givezy app until ${String(d.to ?? "its last day")}.` : `It shows at the top of your page and in the Givezy app from ${days}.`;
      return {
        what: `${quote(d.title)} is your focus. ${c.approved ? when : `Donors see it from ${days}, once your application is approved.`} We don't send a notification about it.`,
        next: seePage(c, { label: "Back to your public profile", href: `${c.base}/profile` }),
      };
    }
    case "focus_removed":
      return { what: `${quote(d.title)} is no longer your focus. It's off your page and out of the app.`, next: seePage(c, { label: "Back to your public profile", href: `${c.base}/profile` }) };
    case "donation_emails_on":
      return { what: "Donation emails are on. We'll email you each time a donation comes in.", next: { label: "Back to your overview", href: c.base } };
    case "donation_emails_off":
      return { what: "Donation emails are off. We won't email you about each donation. You can still see every donation here.", next: { label: "See your donations", href: `${c.base}/donations` } };
    case "campaign_started":
      return {
        what: c.approved ? `${quote(d.title)} is live. Donors can give to it now.` : `${quote(d.title)} is saved. Donors see it once your application is approved.`,
        next: { label: "Next: post an update about it", href: `${c.base}/updates` },
      };
    case "campaign_ended":
      return { what: `${quote(d.title)} has ended. Donors can't give to it any more. Donations already made stay with you.`, next: { label: "Next: thank the people who gave", href: `${c.base}/thank-donors` } };
    case "update_posted":
      return {
        what: c.approved ? "Your update is on your page." : "Your update is saved. It shows on your page once your application is approved.",
        next: seePage(c, { label: "Back to your overview", href: c.base }),
      };
    case "update_removed":
      return { what: "Your update is removed from your page.", next: { label: "Back to your overview", href: c.base } };
    case "photo_added":
      return { what: "Your photo is on your page.", next: seePage(c, { label: "Back to your overview", href: c.base }) };
    case "photo_removed":
      return { what: "Your photo is removed from your page.", next: { label: "Back to your overview", href: c.base } };
    case "organisation_saved":
      return { what: "Your organisation details are saved.", next: { label: "Next: your address", href: app("address") } };
    case "address_saved":
      return { what: "Your address is saved.", next: { label: "Next: your contact person", href: app("contact") } };
    case "sars_details_saved":
      return { what: "Your charity's SARS details are saved. They go in your IT3(d) files from now on.", next: { label: "Check your SARS submission again", href: `${c.base}/receipts/sars` } };
    case "contact_saved":
      return c.approved
        ? { what: `Your contact person is saved. We'll email ${d.email ? String(d.email) : "them"} about your charity.`, next: { label: "Back to your overview", href: c.base } }
        : { what: `Your contact person is saved. We'll email ${d.email ? String(d.email) : "them"} about your application.`, next: { label: "Next: your bank account", href: app("bank") } };
    case "bank_saved":
      return { what: `Your bank account ending ${String(d.last4 ?? "")} is saved. We check it before you go live.`, next: { label: "Next: upload your documents", href: app("documents") } };
    case "document_uploaded":
      return { what: `${quote(d.fileName)} is uploaded as your ${String(d.label ?? "document").toLowerCase()}.`, next: { label: "Next: check everything and submit", href: app("submit") } };
    case "document_removed":
      return { what: `${quote(d.fileName)} is removed.`, next: { label: "Upload the right file", href: app("documents") } };
    case "application_submitted":
      return {
        what: `Your application is with us. We check every application by hand and review it within ${reviewWithin()}, then email you. Your details are locked until then.`,
        next: { label: "While you wait: write your public profile", href: `${c.base}/profile` },
      };
    case "thank_you_sent": {
      const sent = Number(d.sent ?? 0);
      const failed = Number(d.failed ?? 0);
      const remaining = Number(d.remaining ?? 0);
      const thisWeek = Number(d.thisWeek ?? 0);
      const leftOut = thisWeek ? ` ${plural(thisWeek, "donor")} already had a message from you this week, so ${thisWeek === 1 ? "was" : "were"} left out of it. ${WEEKLY_LIMIT}` : "";
      if (remaining) {
        return {
          what: `Your thank-you for ${String(d.month ?? "that month")} has gone to ${plural(sent, "donor")} so far. ${plural(remaining, "donor")} still to go: nobody gets it twice.${leftOut}`,
          next: { label: "Send the rest", href: `${c.base}/thank-donors#unfinished` },
        };
      }
      return {
        what: sent
          ? `Your thank-you for ${String(d.month ?? "that month")} went to ${plural(sent, "donor")}.${failed ? ` ${plural(failed, "email")} could not be sent.` : ""}${leftOut}`
          : `Your thank-you for ${String(d.month ?? "that month")} is saved. Nobody was left to email.${leftOut}`,
        next: { label: "See who gave", href: `${c.base}/donors` },
      };
    }
    case "donor_thanked":
      return {
        what: `Your thank-you went to ${String(d.name ?? "your donor")}.${d.replyTo ? ` If they reply, it goes to ${String(d.replyTo)}.` : ""}`,
        next: { label: "Back to your donors", href: `${c.base}/donors` },
      };
    case "journey_saved":
      return {
        what: `Your donor journey is saved: ${plural(Number(d.steps ?? 0), "email")}. ${d.on ? "Donors on it get the new wording from their next email." : "It's off, so nothing is sent until you switch it on."}`,
        next: d.on ? { label: "See who is on your journey", href: `${c.base}/journey#people` } : { label: "Switch your journey on", href: `${c.base}/journey#switch` },
      };
    case "journey_on":
      return {
        what: `Your donor journey is on. From now, each new donor joins on their first gift and gets ${plural(Number(d.steps ?? 0), "email")} from you, never more than one message from you a week.`,
        next: { label: "Add your existing donors too", href: `${c.base}/journey#existing` },
      };
    case "journey_off":
      return {
        what: "Your donor journey is off. Nobody gets a journey email and nobody new joins until you switch it on again. Everyone keeps their place.",
        next: { label: "Back to your donor journey", href: `${c.base}/journey` },
      };
    case "journey_existing_added":
      return {
        what: existingOutcome({
          added: Number(d.added ?? 0),
          skipped: Object.fromEntries(EXISTING_SKIPS.map((k) => [k, Number(d[`skipped_${k}`] ?? 0)])),
          firstEmail: d.firstEmail ? String(d.firstEmail) : null,
        }),
        next: { label: "See who is on your journey", href: `${c.base}/journey#people` },
      };
    case "s18a_reminders_sent":
      return {
        what: reminderOutcome({
          sent: Number(d.sent ?? 0),
          failed: Number(d.failed ?? 0),
          remaining: Number(d.remaining ?? 0),
          skipped: Object.fromEntries(REMINDER_SKIPS.map((k) => [k, Number(d[`skipped_${k}`] ?? 0)])),
          interrupted: Boolean(d.interrupted),
        }),
        next: { label: "See who still has details missing", href: `${c.base}/donors?s18a=details_missing` },
      };
    case "receipts_approved":
      return {
        what: `You approved ${plural(Number(d.receipts ?? 0), "s18A receipt")} for the ${yearName(d.taxYear)} tax year, ${String(d.total ?? "")} in all. Nothing is issued yet: Givezy checks the list and signs it off, then each donor gets their receipt by email.`,
        next: { label: "See your donors", href: `${c.base}/donors` },
      };
    case "certificate_approved":
      return {
        what: `You approved the s18A receipt for ${String(d.name ?? "this donor")}, ${String(d.total ?? "")} for the ${yearName(d.taxYear)} tax year. It's issued with your list once Givezy has signed it off.`,
        next: nextCertificate(c, d),
      };
    case "certificate_edited":
      return {
        what: `You corrected the donor's ${String(d.changed ?? "details")} and approved the s18A receipt for ${String(d.name ?? "this donor")}. The receipt and your SARS file will both show the corrected details.`,
        next: nextCertificate(c, d),
      };
    case "certificate_declined": {
      const emailed = String(d.emailed ?? "");
      const told =
        emailed === "sent" ? `We've emailed them to contact you on ${String(d.phone ?? "your number")} or ${String(d.email ?? "your email")}.`
        : emailed === "no_address" ? "We have no email address for them, so please contact them yourself."
        : "The email to them hasn't gone yet: open the receipt and press Send the email again, or contact them yourself.";
      return {
        what: `You declined the s18A receipt for ${String(d.name ?? "this donor")}. It's left out of your list. ${told}`,
        next: emailed === "sent" || emailed === "no_address" || !d.key ? nextCertificate(c, d) : { label: "Open the receipt", href: certificateHref(c, d.taxYear, d.key) },
      };
    }
    case "certificate_reopened":
      return {
        what: `The s18A receipt for ${String(d.name ?? "this donor")} is back to "To check".${d.was === "declined" ? " We haven't emailed the donor about it." : ""}`,
        next: d.key ? { label: "Open the receipt", href: certificateHref(c, d.taxYear, d.key) } : { label: "Back to your list", href: `${c.base}/receipts` },
      };
    case "gift_recorded":
      return {
        what: `${String(d.amount ?? "The gift")} from ${String(d.name ?? "your donor")} on ${String(d.date ?? "")} is recorded${d.s18a ? ". It goes on their s18A receipt for the tax year" : ""}.`,
        next: { label: "Record another gift", href: `${c.base}/donations/record` },
      };
    case "gifts_imported":
      return {
        what: `${plural(Number(d.gifts ?? 0), "gift")} from ${quote(d.file)} ${Number(d.gifts ?? 0) === 1 ? "is" : "are"} recorded, ${String(d.total ?? "")} in all.${Number(d.leftOut ?? 0) ? ` ${plural(Number(d.leftOut), "row")} with problems ${Number(d.leftOut) === 1 ? "was" : "were"} left out: fix ${Number(d.leftOut) === 1 ? "it" : "them"} and import ${Number(d.leftOut) === 1 ? "it" : "them"} again.` : ""}`,
        next: { label: "See your donations", href: `${c.base}/donations` },
      };
    case "gifts_removed":
      return { what: `${plural(Number(d.removed ?? 0), "recorded gift")} removed. ${Number(d.removed ?? 0) === 1 ? "It no longer counts" : "They no longer count"} in your totals or on any s18A receipt.`, next: { label: "See your donations", href: `${c.base}/donations` } };
    case "contacts_imported":
      return {
        what: `${plural(Number(d.contacts ?? 0), "donor")} from ${quote(d.file)} ${Number(d.contacts ?? 0) === 1 ? "is" : "are"} on your list, marked "Imported, no gifts yet". Givezy never emails them.`,
        next: { label: "Import another file", href: `${c.base}/donors/import` },
      };
    case "contacts_removed":
      return { what: `${plural(Number(d.removed ?? 0), "imported donor")} removed from your list.`, next: { label: "See your donors", href: `${c.base}/donors` } };
    case "member_added":
      return {
        what: d.already
          ? `${String(d.email ?? "That person")} already had access, so nothing changed.`
          : `${String(d.email ?? "They")} can now sign in and help manage your charity. We've emailed them how.`,
        next: { label: "Back to your team", href: `${c.base}/team` },
      };
    case "member_removed":
      return { what: `${String(d.email ?? "That person")} no longer has access to your dashboard. We've let them know.`, next: { label: "Back to your team", href: `${c.base}/team` } };
    case "appeal_sent": {
      const sent = Number(d.sent ?? 0);
      const waiting = Number(d.waiting ?? 0);
      const skipped = Number(d.skipped ?? 0);
      if (!sent && !waiting) {
        return {
          what: `${quote(d.subject)} is saved, but nobody was emailed${skipped ? `: ${plural(skipped, "donor")} left out (they asked not to get emails, already had a message from you this week, already had 4 from you this month, or email isn't switched on here)` : ""}.${Number(d.failed ?? 0) ? ` ${plural(Number(d.failed), "email")} could not be sent: tell us.` : ""}`,
          next: { label: "See your donors", href: `${c.base}/donors` },
        };
      }
      return {
        what: `${quote(d.subject)} went to ${plural(sent, "donor")}.${waiting ? ` ${plural(waiting, "email")} still to send: press "Send the rest" below.` : ""}${Number(d.failed ?? 0) ? ` ${plural(Number(d.failed), "email")} could not be sent.` : ""}`,
        next: { label: "See your donors", href: `${c.base}/donors` },
      };
    }
  }
}

/** After "Undo": what is back the way it was. */
export function describeUndone(kind: ActionKind, d: Details): string {
  switch (kind) {
    case "profile_saved": return "Taken back. Your public profile is as it was before.";
    case "thank_you_wording_saved": return "Taken back. The thank-you email after each gift is worded as it was before.";
    case "logo_changed": return "Taken back. Your previous logo is back.";
    case "cover_changed": return "Taken back. Your previous cover image is back.";
    case "video_saved": return d.had ? "Taken back. Your previous video is back." : "Taken back. Your page has no video again.";
    case "video_removed": return "Taken back. Your video is on your page again.";
    case "focus_saved": return d.had ? "Taken back. Your previous focus is back as it was." : "Taken back. You have no focus set.";
    case "focus_removed": return `Taken back. ${quote(d.title)} is your focus again, with the same dates.`;
    case "donation_emails_on": return "Taken back. Donation emails are off again.";
    case "donation_emails_off": return "Taken back. Donation emails are on again.";
    case "campaign_started": return `Taken back. ${quote(d.title)} is removed.`;
    case "campaign_ended": return `Taken back. ${quote(d.title)} is running again.`;
    case "update_posted": return "Taken back. The update is removed.";
    case "update_removed": return "Taken back. The update is on your page again.";
    case "photo_added": return "Taken back. The photo is removed.";
    case "photo_removed": return "Taken back. The photo is on your page again.";
    case "organisation_saved": return "Taken back. Your organisation details are as they were before.";
    case "address_saved": return "Taken back. Your address is as it was before.";
    case "contact_saved": return "Taken back. Your previous contact person is back.";
    case "sars_details_saved": return "Taken back. Your charity's SARS details are as they were before.";
    case "bank_saved": return "Taken back. Your previous bank details are back. We still check them before you go live.";
    case "document_uploaded": return `Taken back. ${quote(d.fileName)} is removed.`;
    case "document_removed": return `Taken back. ${quote(d.fileName)} is back.`;
    case "gift_recorded": return "Taken back. The gift is removed and no longer counts anywhere.";
    case "certificate_approved": return `Taken back. The s18A receipt for ${String(d.name ?? "this donor")} is as it was before you approved it.`;
    case "certificate_edited": return `Taken back. The donor's name and address are as they were before, and the s18A receipt is as it was before you corrected it.`;
    case "certificate_reopened": return `Taken back. The s18A receipt for ${String(d.name ?? "this donor")} is ${d.was === "declined" ? "declined" : "approved"} again. We haven't emailed the donor.`;
    case "member_added": return `Taken back. ${String(d.email ?? "They")} no longer ${d.email ? "has" : "have"} access to your dashboard.`;
    case "gifts_imported": return `Taken back. The ${plural(Number(d.gifts ?? 0), "gift")} from ${quote(d.file)} ${Number(d.gifts ?? 0) === 1 ? "is" : "are"} removed.`;
    case "receipts_approved": return `Taken back. Your approval for the ${yearName(d.taxYear)} tax year is withdrawn and nothing will be issued. You can approve the list again when you're ready.`;
    case "contacts_imported": return `Taken back. The ${plural(Number(d.contacts ?? 0), "donor")} from ${quote(d.file)} ${Number(d.contacts ?? 0) === 1 ? "is" : "are"} removed from your list.`;
    case "journey_saved": return "Taken back. Your donor journey's emails are as they were before.";
    case "journey_on": return "Taken back. Your donor journey is off again.";
    case "journey_off": return "Taken back. Your donor journey is on again.";
    case "journey_existing_added": {
      const removed = Number(d.removed ?? d.added ?? 0);
      const stayed = Number(d.stayed ?? 0);
      return stayed
        ? `Taken back. Removed ${plural(removed, "donor")} from your journey; ${stayed} had already had their first email and ${stayed === 1 ? "stays" : "stay"} on.`
        : `Taken back. Removed ${plural(removed, "donor")} from your journey. Nobody was emailed.`;
    }
    case "application_submitted":
    case "thank_you_sent":
    case "contacts_removed":
    case "donor_thanked":
    case "gifts_removed":
    case "member_removed":
    case "appeal_sent":
    case "certificate_declined":
    case "s18a_reminders_sent":
      return "This can't be taken back.";
  }
}

/** The dashboard page an action's panel belongs on. */
export function pageOf(kind: ActionKind): string {
  if (["profile_saved", "logo_changed", "cover_changed", "donation_emails_on", "donation_emails_off", "video_saved", "video_removed", "focus_saved", "focus_removed"].includes(kind)) return "profile";
  if (kind.startsWith("campaign_")) return "campaigns";
  if (kind.startsWith("update_") || kind.startsWith("photo_")) return "updates";
  if (kind === "thank_you_sent" || kind === "thank_you_wording_saved") return "thank-donors";
  if (kind === "donor_thanked" || kind === "contacts_imported" || kind === "contacts_removed" || kind === "s18a_reminders_sent") return "donors";
  if (kind === "receipts_approved" || kind === "sars_details_saved" || kind.startsWith("certificate_")) return "receipts";
  if (kind === "gift_recorded" || kind === "gifts_imported" || kind === "gifts_removed") return "donations";
  if (kind === "member_added" || kind === "member_removed") return "team";
  if (kind === "appeal_sent") return "email-donors";
  if (kind.startsWith("journey_")) return "journey";
  return "application";
}

/** A panel is for the moment just after the action: links opened a day later show nothing. */
export const PANEL_HOURS = 24;

export function isActionKind(s: unknown): s is ActionKind {
  return typeof s === "string" && KINDS.has(s as ActionKind);
}
const KINDS = new Set<ActionKind>([
  "profile_saved", "logo_changed", "cover_changed", "donation_emails_on", "donation_emails_off", "campaign_started", "campaign_ended",
  "video_saved", "video_removed", "focus_saved", "focus_removed",
  "update_posted", "update_removed", "photo_added", "photo_removed", "organisation_saved", "address_saved", "contact_saved", "bank_saved",
  "document_uploaded", "document_removed", "application_submitted", "thank_you_sent", "thank_you_wording_saved", "donor_thanked",
  "receipts_approved", "gift_recorded", "gifts_imported", "gifts_removed", "member_added", "member_removed", "appeal_sent",
  "contacts_imported", "contacts_removed", "sars_details_saved",
  "certificate_approved", "certificate_edited", "certificate_declined", "certificate_reopened", "s18a_reminders_sent",
  "journey_saved", "journey_on", "journey_off", "journey_existing_added",
]);

/** A planned s18A receipt's preview page. */
export function certificateHref(c: Pick<Context, "base">, taxYear: unknown, key: unknown): string {
  return `${c.base}/receipts/certificate?year=${encodeURIComponent(String(taxYear ?? ""))}&c=${encodeURIComponent(String(key ?? ""))}`;
}

/** After a decision on one s18A receipt: the next one still to check, or back to the list to approve it. */
function nextCertificate(c: Context, d: Details): { label: string; href: string } {
  if (d.nextKey) return { label: `Next to check: ${String(d.nextName ?? "the next receipt")}`, href: certificateHref(c, d.taxYear, d.nextKey) };
  return { label: "Back to your list to approve it", href: `${c.base}/receipts#year-${String(d.taxYear ?? "")}` };
}

/** Undo is offered while it is recent, not yet taken back, and the action stored what it needs. */
export function canUndo(row: { undo: unknown; undone_at: string | null; created_at: string }, now: Date): boolean {
  if (row.undo === null || row.undo === undefined || row.undone_at) return false;
  return now.getTime() - new Date(row.created_at).getTime() <= UNDO_MINUTES * 60_000;
}

/** Minutes left to take it back (at least 1 while it can still be taken back). */
export function minutesLeft(createdAt: string, now: Date): number {
  const left = UNDO_MINUTES * 60_000 - (now.getTime() - new Date(createdAt).getTime());
  return Math.max(0, Math.ceil(left / 60_000));
}
