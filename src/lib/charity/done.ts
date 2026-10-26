import { plural } from "@/lib/text";
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
  | "donor_thanked"
  | "receipts_approved"
  | "gift_recorded"
  | "gifts_imported"
  | "gifts_removed"
  | "member_added"
  | "member_removed"
  | "appeal_sent";

/** Actions that can never be taken back: the dashboard asks first instead (Yehuda, 18/10/2026). */
export const ASK_FIRST: ActionKind[] = ["application_submitted", "thank_you_sent", "donor_thanked", "gifts_removed", "member_removed", "appeal_sent"];

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
    case "logo_changed":
      return { what: "Your new logo is up.", next: seePage(c, { label: "Back to your public profile", href: `${c.base}/profile` }) };
    case "cover_changed":
      return { what: "Your new cover image is up.", next: seePage(c, { label: "Back to your public profile", href: `${c.base}/profile` }) };
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
        what: "Your application is with us. We check every application by hand and email you once it's reviewed. Your details are locked until then.",
        next: { label: "While you wait: write your public profile", href: `${c.base}/profile` },
      };
    case "thank_you_sent": {
      const sent = Number(d.sent ?? 0);
      const failed = Number(d.failed ?? 0);
      const remaining = Number(d.remaining ?? 0);
      if (remaining) {
        return {
          what: `Your thank-you for ${String(d.month ?? "that month")} has gone to ${plural(sent, "donor")} so far. ${plural(remaining, "donor")} still to go: nobody gets it twice.`,
          next: { label: "Send the rest", href: `${c.base}/thank-donors#unfinished` },
        };
      }
      return {
        what: sent
          ? `Your thank-you for ${String(d.month ?? "that month")} went to ${plural(sent, "donor")}.${failed ? ` ${plural(failed, "email")} could not be sent.` : ""}`
          : `Your thank-you for ${String(d.month ?? "that month")} is saved. Nobody was left to email.`,
        next: { label: "See who gave", href: `${c.base}/donors` },
      };
    }
    case "donor_thanked":
      return {
        what: `Your thank-you went to ${String(d.name ?? "your donor")}.${d.replyTo ? ` If they reply, it goes to ${String(d.replyTo)}.` : ""}`,
        next: { label: "Back to your donors", href: `${c.base}/donors` },
      };
    case "receipts_approved":
      return {
        what: `You approved ${plural(Number(d.receipts ?? 0), "s18A receipt")} for tax year ${String(d.taxYear ?? "")}, ${String(d.total ?? "")} in all. Nothing is issued yet: Givezy checks the list and signs it off, then each donor gets their receipt by email.`,
        next: { label: "See your donors", href: `${c.base}/donors` },
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
          what: `${quote(d.subject)} is saved, but nobody was emailed${skipped ? `: ${plural(skipped, "donor")} left out (they asked not to get emails, already had 4 from you this month, or email isn't switched on here)` : ""}.${Number(d.failed ?? 0) ? ` ${plural(Number(d.failed), "email")} could not be sent: tell us.` : ""}`,
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
    case "logo_changed": return "Taken back. Your previous logo is back.";
    case "cover_changed": return "Taken back. Your previous cover image is back.";
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
    case "bank_saved": return "Taken back. Your previous bank details are back. We still check them before you go live.";
    case "document_uploaded": return `Taken back. ${quote(d.fileName)} is removed.`;
    case "document_removed": return `Taken back. ${quote(d.fileName)} is back.`;
    case "gift_recorded": return "Taken back. The gift is removed and no longer counts anywhere.";
    case "member_added": return `Taken back. ${String(d.email ?? "They")} no longer ${d.email ? "has" : "have"} access to your dashboard.`;
    case "gifts_imported": return `Taken back. The ${plural(Number(d.gifts ?? 0), "gift")} from ${quote(d.file)} ${Number(d.gifts ?? 0) === 1 ? "is" : "are"} removed.`;
    case "receipts_approved": return `Taken back. Your approval for tax year ${String(d.taxYear ?? "")} is withdrawn and nothing will be issued. You can approve the list again when you're ready.`;
    case "application_submitted":
    case "thank_you_sent":
    case "donor_thanked":
    case "gifts_removed":
    case "member_removed":
    case "appeal_sent":
      return "This can't be taken back.";
  }
}

/** The dashboard page an action's panel belongs on. */
export function pageOf(kind: ActionKind): string {
  if (["profile_saved", "logo_changed", "cover_changed", "donation_emails_on", "donation_emails_off"].includes(kind)) return "profile";
  if (kind.startsWith("campaign_")) return "campaigns";
  if (kind.startsWith("update_") || kind.startsWith("photo_")) return "updates";
  if (kind === "thank_you_sent") return "thank-donors";
  if (kind === "donor_thanked") return "donors";
  if (kind === "receipts_approved") return "receipts";
  if (kind === "gift_recorded" || kind === "gifts_imported" || kind === "gifts_removed") return "donations";
  if (kind === "member_added" || kind === "member_removed") return "team";
  if (kind === "appeal_sent") return "email-donors";
  return "application";
}

/** A panel is for the moment just after the action: links opened a day later show nothing. */
export const PANEL_HOURS = 24;

export function isActionKind(s: unknown): s is ActionKind {
  return typeof s === "string" && KINDS.has(s as ActionKind);
}
const KINDS = new Set<ActionKind>([
  "profile_saved", "logo_changed", "cover_changed", "donation_emails_on", "donation_emails_off", "campaign_started", "campaign_ended",
  "update_posted", "update_removed", "photo_added", "photo_removed", "organisation_saved", "address_saved", "contact_saved", "bank_saved",
  "document_uploaded", "document_removed", "application_submitted", "thank_you_sent", "donor_thanked",
  "receipts_approved", "gift_recorded", "gifts_imported", "gifts_removed", "member_added", "member_removed", "appeal_sent",
]);

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
